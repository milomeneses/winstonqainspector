import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { DEFAULT_RULES, getAssetKind, safeAssetName, type Asset, type Review } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DATA_ROOT = path.join(process.cwd(), "data", "reviews");
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const title = String(form.get("title") || "").trim().slice(0, 160) || "Untitled asset review";
    const creatorName = String(form.get("creatorName") || "").trim().slice(0, 100);
    const overallNote = String(form.get("overallNote") || "").slice(0, 10000);
    const uploads = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!uploads.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
    let total = 0;
    for (const file of uploads) {
      total += file.size;
      if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: file.name + " is over the 100 MB per-file limit." }, { status: 413 });
    }
    if (total > MAX_TOTAL_BYTES) return NextResponse.json({ error: "This review exceeds the 250 MB combined upload limit." }, { status: 413 });

    const id = randomUUID().replaceAll("-", "").slice(0, 24);
    const reviewDir = path.join(DATA_ROOT, id);
    const uploadDir = path.join(reviewDir, "files");
    await mkdir(uploadDir, { recursive: true });
    const assets: Asset[] = [];

    for (const file of uploads) {
      const assetId = randomUUID().replaceAll("-", "").slice(0, 16);
      const originalName = safeAssetName(file.name);
      const extension = originalName.split(".").pop()?.toLowerCase() || "";
      const storedName = assetId + "-" + originalName;
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, storedName), bytes, { flag: "wx" });
      assets.push({
        id: assetId, originalName, storedName, mimeType: file.type || "application/octet-stream", extension,
        kind: getAssetKind(originalName, file.type), size: file.size, uploadedAt: new Date().toISOString(),
        note: "", status: "needs-review", qaResults: [], strokes: [], timeNotes: [],
        fileUrl: "/api/reviews/" + id + "/files/" + assetId
      });
    }

    const now = new Date().toISOString();
    const review: Review = {
      id, title, createdAt: now, updatedAt: now, creatorName, overallNote,
      status: "needs-review", assets, rules: DEFAULT_RULES
    };
    await writeFile(path.join(reviewDir, "review.json"), JSON.stringify(review, null, 2), { flag: "wx" });
    return NextResponse.json({ review: publicReview(review), shareUrl: "/review/" + id }, { status: 201 });
  } catch (error) {
    console.error("Review create failed", error);
    return NextResponse.json({ error: "Could not save this review. Check available disk space and the upload size, then retry." }, { status: 500 });
  }
}

function publicReview(review: Review) { return review; }
