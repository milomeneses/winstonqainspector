import type { QAReport } from "./qa";

export function downloadJson(report: QAReport) {
  downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), safeName(report.fileName) + "-qa.json");
}
export function downloadCsv(report: QAReport) {
  const rows = [
    ["ZIP", report.fileName], ["ZIP bytes", String(report.zipBytes)],
    ["ZIP size limit bytes", String(report.maxZipBytes)], ["Detected platforms", report.detectedPlatforms.join("; ")], [],
    ["Status", "Check", "Detail", "Evidence"],
    ...report.findings.map(f => [f.status, f.title, f.detail, f.evidence || ""]), [],
    ["File", "Text bytes (when scanned)", "Extension"],
    ...report.files.map(f => [f.name, String(f.bytes), f.type]),
  ];
  const csv = rows.map(row => row.map(value => '"' + String(value ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), safeName(report.fileName) + "-qa.csv");
}
function safeName(name: string) { return name.replace(/\.zip$/i, "").replace(/[^a-z0-9_-]+/gi, "_"); }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
