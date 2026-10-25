import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import type { Review } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DATA_ROOT = path.join(process.cwd(), "data", "reviews");
const INLINE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif",
  gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
  mov: "video/quicktime", m4v: "video/mp4", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  ogg: "audio/ogg", pdf: "application/pdf"
};

export async function GET(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await context.params;
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{16}$/.test(assetId)) return new Response("Not found", { status: 404 });
  try {
    const json = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(DATA_ROOT, id, "review.json"), "utf8")) as Review;
    const asset = json.assets.find(a => a.id === assetId);
    if (!asset) return new Response("Not found", { status: 404 });
    const filePath = path.join(DATA_ROOT, id, "files", asset.storedName);
    const info = await stat(filePath);
    const type = INLINE_TYPES[asset.extension] || "application/octet-stream";
    const commonHeaders: Record<string, string> = {
      "Content-Type": type, "Content-Length": String(info.size), "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' blob: data:; style-src 'unsafe-inline'; media-src 'self' blob: data:; frame-ancestors 'self'",
      "Content-Disposition": type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/") || type === "application/pdf" ? "inline" : "attachment; filename=\"" + asset.originalName.replace(/["\\r\\n]/g, "_") + "\""
    };
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
        if (start <= end && start < info.size) {
          commonHeaders["Content-Length"] = String(end - start + 1);
          commonHeaders["Content-Range"] = "bytes " + start + "-" + end + "/" + info.size;
          return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream, { status: 206, headers: commonHeaders });
        }
        return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + info.size } });
      }
    }
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { headers: commonHeaders });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
