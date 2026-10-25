import JSZip from "jszip";

export type Status = "PASS" | "WARN" | "FAIL" | "INFO";
export type Finding = { id: string; status: Status; title: string; detail: string; evidence?: string };
export type FileSummary = { name: string; bytes: number; type: string };
export type QAReport = {
  fileName: string; zipBytes: number; maxZipBytes: number; htmlFiles: string[];
  files: FileSummary[]; detectedPlatforms: string[]; findings: Finding[]; createdAt: string;
};

function fmt(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return value.toFixed(2) + " " + units[i];
}

function fingerprint(text: string): string[] {
  const found: string[] = [];
  if (/dhtml\.getvar|adform|clicktag/i.test(text)) found.push("Adform (possible)");
  if (/googleads|doubleclick|gwdgooglead|google\.com\/ads/i.test(text)) found.push("Google Ads (possible)");
  if (/dc\.advertising|exitapi|studio\.getelement|campaign manager/i.test(text)) found.push("Campaign Manager 360 / Studio (possible)");
  if (/ad\.size|iab/i.test(text)) found.push("IAB-style HTML5 (possible)");
  if (!found.length && /clicktag|click_tag|clickthrough/i.test(text)) found.push("Generic HTML5 ad (possible)");
  return found.length ? Array.from(new Set(found)) : ["Unknown / custom HTML5"];
}

export async function analyzeZip(file: File, maxZipBytes: number): Promise<QAReport> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a .zip file.");
  if (!file.size) throw new Error("The selected ZIP is empty.");
  const findings: Finding[] = [];
  const add = (id: string, status: Status, title: string, detail: string, evidence?: string) =>
    findings.push({ id, status, title, detail, evidence });
  add("zip-size", file.size <= maxZipBytes ? "PASS" : "FAIL", "ZIP size limit",
    fmt(file.size) + " / " + fmt(maxZipBytes) + " (" + file.size.toLocaleString() + " / " + maxZipBytes.toLocaleString() + " bytes).",
    file.size + " bytes");

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(file, { checkCRC32: true, createFolders: false }); }
  catch { throw new Error("Could not read this ZIP. It may be corrupt, encrypted, unsupported, or too large for browser memory."); }

  const entries = Object.values(zip.files).filter(e => !e.dir && !e.name.startsWith("__MACOSX/") && !e.name.split("/").includes(".DS_Store"));
  const htmlFiles = entries.filter(e => /\.html?$/i.test(e.name)).map(e => e.name);
  const files: FileSummary[] = [];
  const sources: { name: string; content: string }[] = [];
  for (const entry of entries) {
    const ext = entry.name.split(".").pop()?.toLowerCase() || "unknown";
    if (/\.(html?|js|json|css|xml|txt)$/i.test(entry.name)) {
      try {
        const content = await entry.async("string");
        if (content.length <= 5000000) sources.push({ name: entry.name, content });
        else add("large-" + entry.name, "WARN", "Large source file skipped", entry.name + " is over 5 MB; source scan skipped.");
        files.push({ name: entry.name, bytes: new TextEncoder().encode(content).length, type: ext });
      } catch { add("read-" + entry.name, "WARN", "Could not read source file", "Could not inspect " + entry.name + "."); }
    } else files.push({ name: entry.name, bytes: 0, type: ext });
  }

  if (!htmlFiles.length) add("html-entry", "FAIL", "HTML entry point missing", "No .html or .htm file was found in the ZIP.");
  else {
    const roots = htmlFiles.filter(name => !name.includes("/"));
    add("html-entry", roots.length ? "PASS" : "WARN", roots.length ? "Root HTML found" : "HTML found in subfolder",
      roots.length ? "Found " + roots.length + " HTML file(s) at ZIP root." : "HTML exists only in a subfolder. Some ad platforms require the entry HTML at the ZIP root.",
      htmlFiles.join(", "));
    if (htmlFiles.length > 1) add("multiple-html", "INFO", "Multiple HTML files", "Found " + htmlFiles.length + " HTML files; confirm the intended entry point.", htmlFiles.join(", "));
  }

  const allText = sources.map(s => s.content).join("\n");
  const clickFound = /\bclickTag\b|\bclick_tag\b|ExitApi|Enabler\.exit|dhtml\.getVar\s*\(\s*['"]clickTAG/i.test(allText);
  add("clicktag", clickFound ? "PASS" : "WARN",
    clickFound ? "Click-through pattern detected" : "Click-through pattern not detected",
    clickFound ? "A common clickTag / exit API pattern was found. Static detection does not prove that the click works or meets a platform's requirements."
      : "No common clickTag or exit API pattern was found. Custom implementations may produce false negatives; verify platform requirements.");

  const adSize = allText.match(/<meta[^>]+name\s*=\s*["']ad\.size["'][^>]+content\s*=\s*["']([^"']+)["']/i)
    || allText.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']ad\.size["']/i);
  const cssSize = allText.match(/width\s*:\s*(\d{2,4})px[\s\S]{0,160}?height\s*:\s*(\d{2,4})px/i);
  if (adSize) add("dimensions", "PASS", "Ad size metadata found", "Found ad.size: " + adSize[1] + ".", adSize[0]);
  else if (cssSize) add("dimensions", "WARN", "Possible dimensions found in CSS", "Found a possible " + cssSize[1] + "×" + cssSize[2] + " px pattern, but no standard ad.size declaration.", cssSize[0]);
  else add("dimensions", "WARN", "Ad dimensions not identified", "No standard ad.size declaration or simple CSS width/height pattern was found.");

  const urls = Array.from(new Set(allText.match(/https?:\/\/[^\s"'<>\\)]+/gi) || []));
  const external = urls.filter(url => !/googleapis\.com|gstatic\.com|adform\.net|doubleclick\.net/i.test(url));
  add("external-resources", external.length ? "WARN" : "PASS", external.length ? "External URLs found" : "No obvious external URLs found",
    external.length ? "Found " + external.length + " unique absolute URLs. Confirm they are allowed and reachable." : "No obvious absolute HTTP(S) URLs were found in scanned source files.",
    external.slice(0, 15).join("\n") || undefined);

  const missing: string[] = [];
  for (const source of sources) {
    for (const match of source.content.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)) {
      const ref = match[1].trim().split(/[?#]/)[0];
      if (!ref || /^(https?:|data:|blob:|javascript:|mailto:|tel:|\/\/)/i.test(ref)) continue;
      let normalized = ref;
      try { normalized = decodeURIComponent(ref); } catch {}
      normalized = normalized.replace(/^\.\//, "");
      if (!entries.some(e => e.name === normalized || e.name.endsWith("/" + normalized))) missing.push(source.name + ": " + ref);
    }
  }
  const uniqueMissing = Array.from(new Set(missing));
  add("local-resources", uniqueMissing.length ? "WARN" : "PASS",
    uniqueMissing.length ? "Possible missing local resources" : "Local resource references look consistent",
    uniqueMissing.length ? "Static scan found " + uniqueMissing.length + " src/href reference(s) that did not match a ZIP entry. Dynamic paths and CSS url() are not fully covered."
      : "No missing local src/href references were detected by this basic scan.",
    uniqueMissing.slice(0, 20).join("\n") || undefined);

  if (Object.keys(zip.files).some(name => name.startsWith("__MACOSX/")))
    add("macos-junk", "WARN", "macOS metadata folder present", "ZIP contains __MACOSX entries, usually unnecessary in ad packages.");

  const platforms = fingerprint(allText);
  add("platform-detection", "INFO", "Platform fingerprint", "Possible profile(s): " + platforms.join(", ") + ". This is heuristic, not certification.", platforms.join("\n"));
  return { fileName: file.name, zipBytes: file.size, maxZipBytes, htmlFiles,
    files: files.sort((a, b) => a.name.localeCompare(b.name)), detectedPlatforms: platforms,
    findings, createdAt: new Date().toISOString() };
}

export function formatBytes(bytes: number) { return fmt(bytes); }
