export type AssetKind = "image" | "gif" | "html" | "video" | "audio" | "pdf" | "html5-zip" | "document" | "unknown";
export type ReviewStatus = "needs-review" | "approved" | "changes-requested";
export type RuleSeverity = "blocker" | "warning" | "info";
export type RuleResultStatus = "pass" | "fail" | "review" | "na";
export type QAResult = { ruleId: string; status: RuleResultStatus; detail: string; checkedAt: string };
export type QAItem = {
  id: string; name: string; description: string; enabled: boolean;
  severity: RuleSeverity; appliesTo: AssetKind[] | ["all"];
};
export type Point = { x: number; y: number };
export type Stroke = {
  id: string; points: Point[]; color: string; width: number;
  timestampSec: number | null; createdAt: string;
};
export type TimeNote = { id: string; timestampSec: number; text: string; createdAt: string };
export type Asset = {
  id: string; originalName: string; storedName: string; mimeType: string; extension: string;
  kind: AssetKind; size: number; uploadedAt: string; note: string; status: ReviewStatus;
  qaResults: QAResult[]; strokes: Stroke[]; timeNotes: TimeNote[];
  fileUrl: string;
};
export type Review = {
  id: string; title: string; createdAt: string; updatedAt: string;
  creatorName: string; overallNote: string; status: ReviewStatus; assets: Asset[]; rules: QAItem[];
};
export type PublicReview = Omit<Review, "assets"> & { assets: Asset[] };

export const DEFAULT_RULES: QAItem[] = [
  { id: "file-size", name: "File size", description: "Check each asset against the configured review size limit.", enabled: true, severity: "blocker", appliesTo: ["all"] },
  { id: "extension", name: "File type / extension", description: "Extension and MIME should indicate a supported asset type.", enabled: true, severity: "warning", appliesTo: ["all"] },
  { id: "dimensions", name: "Image dimensions", description: "Record image dimensions and confirm they match the delivery brief.", enabled: true, severity: "warning", appliesTo: ["image", "gif"] },
  { id: "video-playback", name: "Video playback", description: "Check that video metadata can be loaded and playback works in this browser.", enabled: true, severity: "warning", appliesTo: ["video"] },
  { id: "video-audio", name: "Video/audio", description: "Review loudness, audio presence, codec support and any requested specs manually.", enabled: true, severity: "info", appliesTo: ["video", "audio"] },
  { id: "pdf-pages", name: "PDF preview", description: "Confirm the PDF renders and review each page.", enabled: true, severity: "warning", appliesTo: ["pdf"] },
  { id: "html5-entry", name: "HTML5 ZIP structure", description: "Check for a root HTML file and common click-through patterns.", enabled: true, severity: "blocker", appliesTo: ["html5-zip"] },
  { id: "copy", name: "Copy and creative", description: "Review spelling, legal lines, CTA, brand and visual alignment.", enabled: true, severity: "warning", appliesTo: ["all"] },
  { id: "safe-area", name: "Safe area / cropping", description: "Review safe areas and confirm important content is not cropped.", enabled: true, severity: "warning", appliesTo: ["image", "gif", "video", "html5-zip"] },
  { id: "links", name: "Destination URLs", description: "Confirm outbound URLs and tracking links are correct.", enabled: true, severity: "warning", appliesTo: ["html5-zip", "document"] }
];

export function getAssetKind(name: string, mimeType = ""): AssetKind {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["zip"].includes(ext)) return "html5-zip";
  if (["html", "htm"].includes(ext)) return "html";
  if (["gif"].includes(ext)) return "gif";
  if (["jpg", "jpeg", "png", "webp", "avif", "bmp", "svg", "tif", "tiff"].includes(ext) || mimeType.startsWith("image/")) return "image";
  if (["mp4", "mov", "webm", "m4v", "ogv", "avi", "mkv"].includes(ext) || mimeType.startsWith("video/")) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext) || mimeType.startsWith("audio/")) return "audio";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "rtf"].includes(ext)) return "document";
  return "unknown";
}

export function safeAssetName(name: string): string {
  return name.replace(/[/\\\\]/g, "_").replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 180) || "asset";
}
