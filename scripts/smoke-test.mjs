import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

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

  console.log("PASS: create review, persist notes/status, serve uploaded asset, add asset, delete asset.");
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
