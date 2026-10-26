import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import type { Review } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DATA_ROOT = path.join(process.env.WINSTON_DATA_DIR || path.join(process.cwd(), "data"), "reviews");
const MAX_PREVIEW_ZIP_BYTES = 25 * 1024 * 1024;

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", xml: "application/xml; charset=utf-8", txt: "text/plain; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
};

function normalizedZipPath(value: string) {
  const raw = value.replace(/\\/g, "/");
  if (raw.startsWith("/") || raw.includes("\0")) return null;
  const output: string[] = [];
  for (const piece of raw.split("/")) {
    if (!piece || piece === ".") continue;
    if (piece === "..") {
      if (!output.length) return null;
      output.pop();
    } else output.push(piece);
  }
  return output.join("/");
}
function encodePath(value: string) {
  return value.split("/").map(part => encodeURIComponent(part)).join("/");
}
function rootRelativeToPreview(source: string, prefix: string) {
  return source.replace(/(\\b(?:src|href|poster|action|data|xlink:href)\\s*=\\s*)(["'])(\\/(?!\\/)[^"']*)\\2/gi,
    (_full, attr: string, quote: string, ref: string) => attr + quote + prefix + ref.slice(1) + quote)
    .replace(/url\\(\\s*(["']?)(\\/(?!\\/)[^)'"]+)\\1\\s*\\)/gi,
      (_full, quote: string, ref: string) => "url(" + quote + prefix + ref.slice(1) + quote + ")");
}
function makeCsp() {
  return "default-src 'self' data: blob: https:; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:; font-src 'self' data: blob: https:; connect-src 'self' https: http:; object-src 'none'; form-action 'none'; frame-ancestors 'self'";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; assetId: string; filePath: string[] }> }) {
  const { id, assetId, filePath } = await context.params;
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{16}$/.test(assetId) || !filePath?.length) {
    return new Response("Not found", { status: 404 });
  }
  const requestPath = normalizedZipPath(filePath.join("/"));
  if (!requestPath) return new Response("Invalid preview path", { status: 400 });

  try {
    const review = JSON.parse(await readFile(path.join(DATA_ROOT, id, "review.json"), "utf8")) as Review;
    const asset = review.assets.find(item => item.id === assetId && item.kind === "html5-zip");
    if (!asset) return new Response("HTML5 ZIP asset not found", { status: 404 });

    const zipFile = path.join(DATA_ROOT, id, "files", asset.storedName);
    const bytes = await readFile(zipFile);
    if (bytes.byteLength > MAX_PREVIEW_ZIP_BYTES) {
      return new Response("Preview is limited to ZIP files of 25 MB or less. Download the ZIP to inspect it locally.", { status: 413 });
    }
    const archive = await JSZip.loadAsync(bytes, { checkCRC32: false });
    const entry = requestPath === "__entry__"
      ? Object.values(archive.files).filter(item => !item.dir && /\\.html?$/i.test(item.name) && !item.name.startsWith("__MACOSX/")).sort((a, b) => (a.name.includes("/") ? 1 : 0) - (b.name.includes("/") ? 1 : 0))[0]
      : archive.file(requestPath);
    if (!entry || entry.dir) return new Response("Preview asset not found: " + requestPath, { status: 404 });
    const actualPath = entry.name;

    const extension = actualPath.split(".").pop()?.toLowerCase() || "bin";
    const type = MIME[extension] || "application/octet-stream";
    let output: Buffer;

    if (extension === "html" || extension === "htm") {
      let html = await entry.async("string");
      const previewRoot = "/api/reviews/" + id + "/preview/" + assetId + "/";
      const directory = actualPath.includes("/") ? actualPath.slice(0, actualPath.lastIndexOf("/") + 1) : "";
      const base = previewRoot + encodePath(directory);
      html = html.replace(/<base\\b[^>]*>/gi, "");
      html = rootRelativeToPreview(html, previewRoot);
      const baseTag = '<base href="' + base + '">';
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, "<head$1>" + baseTag);
      else html = "<!doctype html><html><head>" + baseTag + "</head><body>" + html + "</body></html>";
      output = Buffer.from(html, "utf8");
    } else if (extension === "css") {
      let css = await entry.async("string");
      const previewRoot = "/api/reviews/" + id + "/preview/" + assetId + "/";
      css = css.replace(/url\\(\\s*(["']?)(\\/(?!\\/)[^)'"]+)\\1\\s*\\)/gi,
        (_full, quote: string, ref: string) => "url(" + quote + previewRoot + ref.slice(1) + quote + ")");
      output = Buffer.from(css, "utf8");
    } else {
      output = Buffer.from(await entry.async("uint8array"));
    }

    return new Response(new Uint8Array(output), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(output.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Security-Policy": makeCsp(),
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("HTML5 preview failed", error);
    return new Response("Could not serve this preview resource.", { status: 500 });
  }
}
