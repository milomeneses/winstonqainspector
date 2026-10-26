import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { decompressFrames, parseGIF } from "gifuct-js";

const port = 4317;
const base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), WINSTON_DATA_DIR: path.join(process.cwd(), "data") }
});
let logs = "";
server.stdout.on("data", data => { logs += data.toString(); });
server.stderr.on("data", data => { logs += data.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, options) {
  const response = await fetch(url, options);
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.arrayBuffer();
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url + " — " + (data?.error || ""));
  return { response, data };
}
let reviewId = "";
try {
  const gifFixture = Buffer.from("R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQICgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQIFAAAACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7", "base64");
  const parsedGif = parseGIF(gifFixture.buffer.slice(gifFixture.byteOffset, gifFixture.byteOffset + gifFixture.byteLength));
  const gifFrames = decompressFrames(parsedGif, true);
  if (parsedGif.lsd.width !== 2 || parsedGif.lsd.height !== 2 || gifFrames.length !== 2) throw new Error("Animated GIF frame decoder fixture failed.");
  if (!gifFrames.every(frame => frame.patch.length > 0)) throw new Error("GIF frame patches were not decoded.");

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Next server exited early: " + logs);
    try { const r = await fetch(base); if (r.ok) { ready = true; break; } } catch {}
    await wait(500);
  }
  if (!ready) throw new Error("Next production server did not start. " + logs);

  const form = new FormData();
  form.set("title", "CI smoke review");
  form.set("creatorName", "CI");
  form.set("overallNote", "Original review note");
  form.append("files", new Blob(["<svg xmlns='http://www.w3.org/2000/svg' width='2' height='2'></svg>"], { type: "image/svg+xml" }), "qa-smoke.svg");
  const created = await request(base + "/api/reviews", { method: "POST", body: form });
  const review = created.data.review;
  reviewId = review.id;
  if (created.response.status !== 201 || !review.assets?.[0]?.id) throw new Error("Review creation did not return an asset.");
  const asset = review.assets[0];
  if (asset.kind !== "image") throw new Error("Image type detection failed: " + asset.kind);

  const fetchedAsset = await request(base + asset.fileUrl);
  if (new TextDecoder().decode(fetchedAsset.data).indexOf("<svg") < 0) throw new Error("Uploaded asset bytes did not round-trip.");

  const patched = await request(base + "/api/reviews/" + reviewId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overallNote: "Saved review note", assets: [{ id: asset.id, note: "Please review the edges", status: "approved", strokes: [], timeNotes: [], qaResults: [] }] })
  });
  if (patched.data.review.overallNote !== "Saved review note") throw new Error("Review note did not save.");
  if (patched.data.review.assets[0].note !== "Please review the edges") throw new Error("Asset notes did not save.");

  const addedForm = new FormData();
  addedForm.append("files", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "qa-smoke.pdf");
  const added = await request(base + "/api/reviews/" + reviewId + "/files", { method: "POST", body: addedForm });
  if (!added.data.assets?.[0] || added.data.assets[0].kind !== "pdf") throw new Error("Adding an asset did not work.");
  const afterAdd = await request(base + "/api/reviews/" + reviewId);
  if (afterAdd.data.review.assets.length !== 2) throw new Error("Additional asset was not persisted.");

  await request(base + "/api/reviews/" + reviewId + "/files/" + asset.id, { method: "DELETE" });
  const afterDelete = await request(base + "/api/reviews/" + reviewId);
  if (afterDelete.data.review.assets.length !== 1) throw new Error("Asset removal was not persisted.");

  const previewZip = new JSZip();
  previewZip.file("index.html", '<!doctype html><html><head><link rel="stylesheet" href="css/style.css"></head><body><img id="pixel" src="images/pixel.svg"><div class="label">ZIP PREVIEW OK</div></body></html>');
  previewZip.file("css/style.css", "body { background: #fafafa; } .label { color: green; }");
  previewZip.file("images/pixel.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="green"/></svg>');
  const zipBytes = await previewZip.generateAsync({ type: "nodebuffer" });
  const zipForm = new FormData();
  zipForm.append("files", new Blob([zipBytes], { type: "application/zip" }), "qa-smoke-html5.zip");
  const zipAdded = await request(base + "/api/reviews/" + reviewId + "/files", { method: "POST", body: zipForm });
  const zipAsset = zipAdded.data.assets?.[0];
  if (!zipAsset || zipAsset.kind !== "html5-zip") throw new Error("HTML5 ZIP upload/type detection failed.");
  const previewUrl = base + "/api/reviews/" + reviewId + "/preview/" + zipAsset.id + "/__entry__";
  const previewResponse = await fetch(previewUrl);
  if (!previewResponse.ok) throw new Error("ZIP entry preview endpoint failed: HTTP " + previewResponse.status + " " + await previewResponse.text());
  if (!(previewResponse.headers.get("content-type") || "").includes("text/html")) throw new Error("ZIP entry preview did not return HTML.");
  const previewHtml = await previewResponse.text();
  if (!previewHtml.includes("ZIP PREVIEW OK") || !previewHtml.includes("<base href=")) throw new Error("ZIP entry preview did not inject a working base path.");
  const imageResponse = await fetch(base + "/api/reviews/" + reviewId + "/preview/" + zipAsset.id + "/images/pixel.svg");
  if (!imageResponse.ok) throw new Error("ZIP relative image route failed: HTTP " + imageResponse.status);
  if (!(imageResponse.headers.get("content-type") || "").includes("image/svg+xml")) throw new Error("ZIP relative image route returned the wrong content type.");
  const imageText = await imageResponse.text();
  if (!imageText.includes("<svg")) throw new Error("ZIP relative image bytes did not round-trip.");

  console.log("PASS: decode animated GIF frames; create review, persist notes/status, serve uploaded asset, add/delete assets, and serve ZIP HTML/CSS/image resources with relative paths.");
} catch (error) {
  console.error("FAIL: review API smoke test:", error);
  console.error(logs);
  process.exitCode = 1;
} finally {
  if (reviewId) await rm(path.join(process.cwd(), "data", "reviews", reviewId), { recursive: true, force: true }).catch(() => {});
  server.kill("SIGTERM");
  await wait(500);
  if (server.exitCode === null) server.kill("SIGKILL");
}
