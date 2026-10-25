import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Review } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DATA_ROOT = path.join(process.env.WINSTON_DATA_DIR || path.join(process.cwd(), "data"), "reviews");

async function loadReview(id: string): Promise<Review | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  try { return JSON.parse(await readFile(path.join(DATA_ROOT, id, "review.json"), "utf8")) as Review; }
  catch { return null; }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const review = await loadReview(id);
  if (!review) return NextResponse.json({ error: "This review link does not exist or is no longer available." }, { status: 404 });
  return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const review = await loadReview(id);
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  try {
    const body = await request.json() as Partial<Review>;
    if (typeof body.title === "string") review.title = body.title.slice(0, 160);
    if (typeof body.creatorName === "string") review.creatorName = body.creatorName.slice(0, 100);
    if (typeof body.overallNote === "string") review.overallNote = body.overallNote.slice(0, 10000);
    if (body.status && ["needs-review", "approved", "changes-requested"].includes(body.status)) review.status = body.status;
    if (Array.isArray(body.rules)) {
      review.rules = body.rules.slice(0, 100).map(rule => ({
        id: String(rule.id).slice(0, 80), name: String(rule.name).slice(0, 160),
        description: String(rule.description).slice(0, 1000), enabled: Boolean(rule.enabled),
        severity: ["blocker", "warning", "info"].includes(rule.severity) ? rule.severity : "warning",
        appliesTo: (Array.isArray(rule.appliesTo) ? rule.appliesTo.slice(0, 20) : ["all"]) as unknown as Review["rules"][number]["appliesTo"]
      }));
    }
    if (Array.isArray(body.assets)) {
      const incoming = new Map(body.assets.map(asset => [asset.id, asset]));
      review.assets = review.assets.map(asset => {
        const patch = incoming.get(asset.id);
        if (!patch) return asset;
        return {
          ...asset,
          note: typeof patch.note === "string" ? patch.note.slice(0, 10000) : asset.note,
          status: patch.status && ["needs-review", "approved", "changes-requested"].includes(patch.status) ? patch.status : asset.status,
          strokes: Array.isArray(patch.strokes) ? patch.strokes.slice(0, 500).map(stroke => ({
            id: String(stroke.id).slice(0, 80), color: /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : "#ff3b30",
            width: Math.max(1, Math.min(20, Number(stroke.width) || 3)),
            timestampSec: stroke.timestampSec == null ? null : Math.max(0, Math.min(24 * 60 * 60, Number(stroke.timestampSec) || 0)),
            points: Array.isArray(stroke.points) ? stroke.points.slice(0, 5000).map(point => ({ x: Math.max(0, Math.min(1, Number(point.x) || 0)), y: Math.max(0, Math.min(1, Number(point.y) || 0)) })) : [],
            createdAt: String(stroke.createdAt).slice(0, 60)
          })) : asset.strokes,
          timeNotes: Array.isArray(patch.timeNotes) ? patch.timeNotes.slice(0, 500).map(note => ({
            id: String(note.id).slice(0, 80), timestampSec: Math.max(0, Math.min(24 * 60 * 60, Number(note.timestampSec) || 0)),
            text: String(note.text).slice(0, 2000), createdAt: String(note.createdAt).slice(0, 60)
          })) : asset.timeNotes,
          qaResults: Array.isArray(patch.qaResults) ? patch.qaResults.slice(0, 100).map(result => ({
            ruleId: String(result.ruleId).slice(0, 80), status: ["pass", "fail", "review", "na"].includes(result.status) ? result.status : "review",
            detail: String(result.detail).slice(0, 2000), checkedAt: String(result.checkedAt).slice(0, 60)
          })) : asset.qaResults
        };
      });
    }
    review.updatedAt = new Date().toISOString();
    await writeFile(path.join(DATA_ROOT, id, "review.json"), JSON.stringify(review, null, 2), "utf8");
    return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not save your changes." }, { status: 400 });
  }
}
