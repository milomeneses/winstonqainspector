"use client";

import JSZip from "jszip";
import { ChangeEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, Check, CheckCircle2, CircleAlert, Clock3, Copy, Download, FileArchive, FileAudio,
  FileImage, FilePlus2, FileText, Film, Link2, LoaderCircle, MessageSquare, Minus, Palette, Pencil, Play,
  Plus, Save, ShieldCheck, Trash2, Video, X, XCircle
} from "lucide-react";
import { analyzeZip, formatBytes } from "@/lib/qa";
import { DEFAULT_RULES, type Asset, type AssetKind, type QAItem, type QAResult, type Review, type ReviewStatus, type RuleSeverity, type Stroke, type TimeNote } from "@/lib/review-types";

type MediaMeta = { width?: number; height?: number; duration?: number; loaded?: boolean };
const KIND_LABEL: Record<AssetKind, string> = {
  image: "Image", gif: "Animated GIF", video: "Video", audio: "Audio", pdf: "PDF", "html5-zip": "HTML5 ZIP", document: "Document", unknown: "Unknown file"
};
const STATUS_LABEL: Record<ReviewStatus, string> = { "needs-review": "Needs review", approved: "Approved", "changes-requested": "Changes requested" };
const STATUS_CLASS: Record<ReviewStatus, string> = { "needs-review": "needs", approved: "approved", "changes-requested": "changes" };
const KIND_ICON: Record<AssetKind, typeof FileImage> = { image: FileImage, gif: FileImage, video: Film, audio: FileAudio, pdf: FileText, "html5-zip": FileArchive, document: FileText, unknown: FileText };
const RULE_HINTS: Record<string, string> = {
  "file-size": "Default thresholds: HTML5 ZIP 150 KB, image/GIF 5 MB, video 50 MB, PDF 20 MB, other file 20 MB.",
  "dimensions": "The preview reports pixel dimensions when the browser can read them. Compare against your delivery brief.",
  "html5-entry": "The ZIP check is static. It does not certify platform acceptance or prove that click-through behavior works."
};

function niceSize(n: number) {
  if (n < 1024) return n + " B";
  const units = ["KB", "MB", "GB"]; let value = n / 1024, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return value.toFixed(2) + " " + units[i];
}
function id() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); }
function fmtTime(value: number) {
  const m = Math.floor(Math.max(0, value) / 60), s = Math.floor(Math.max(0, value) % 60), ms = Math.floor((Math.max(0, value) % 1) * 10);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + (ms ? "." + ms : "");
}
function thresholdBytes(kind: AssetKind) {
  if (kind === "html5-zip") return 150 * 1024;
  if (kind === "image" || kind === "gif") return 5 * 1024 * 1024;
  if (kind === "video") return 50 * 1024 * 1024;
  if (kind === "pdf") return 20 * 1024 * 1024;
  return 20 * 1024 * 1024;
}
function applicable(rule: QAItem, asset: Asset) { return rule.appliesTo.includes("all") || rule.appliesTo.includes(asset.kind); }

export default function ReviewWorkspace({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const addInput = useRef<HTMLInputElement>(null);
  const latest = useRef<Review | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [activeTab, setActiveTab] = useState<"feedback" | "qa">("feedback");
  const [annotating, setAnnotating] = useState(false);
  const [brushColor, setBrushColor] = useState("#ff3b30");
  const [brushWidth, setBrushWidth] = useState(3);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeNoteText, setTimeNoteText] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, MediaMeta>>({});
  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [ruleSeverity, setRuleSeverity] = useState<RuleSeverity>("warning");
  const [showNewRule, setShowNewRule] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState("");

  const setData = useCallback((next: Review | ((old: Review) => Review)) => {
    setReview(old => {
      if (!old) return old;
      const value = typeof next === "function" ? next(old) : next;
      latest.current = value;
      return value;
    });
    setDirty(true);
    setSaveState("saving");
  }, []);

  useEffect(() => { latest.current = review; }, [review]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/reviews/" + reviewId, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Review not found.");
        return data.review as Review;
      })
      .then(data => {
        if (cancelled) return;
        setReview(data); latest.current = data; setActiveId(data.assets[0]?.id || "");
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setLoadError(e instanceof Error ? e.message : "Could not load review."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reviewId]);

  useEffect(() => {
    if (!dirty || !review) return;
    const snapshot = review;
    const timer = setTimeout(async () => {
      try {
        setSaveState("saving");
        const response = await fetch("/api/reviews/" + reviewId, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot)
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Save failed");
        if (latest.current && JSON.stringify(latest.current) === JSON.stringify(snapshot)) {
          setReview(payload.review); latest.current = payload.review; setDirty(false); setSaveState("saved");
        } else {
          setSaveState("saving");
        }
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, review, reviewId]);

  const active = review?.assets.find(a => a.id === activeId) || null;
  const visibleAssets = useMemo(() => (review?.assets || []).filter(a => (a.originalName + " " + KIND_LABEL[a.kind]).toLowerCase().includes(assetSearch.toLowerCase())), [review, assetSearch]);
  const url = typeof window !== "undefined" ? window.location.origin + "/review/" + reviewId : "/review/" + reviewId;
  const updateAsset = useCallback((assetId: string, patch: Partial<Asset>) => {
    setData(old => ({ ...old, assets: old.assets.map(a => a.id === assetId ? { ...a, ...patch } : a) }));
  }, [setData]);
  const updateMeta = useCallback((assetId: string, patch: MediaMeta) => {
    setMetadata(old => ({ ...old, [assetId]: { ...old[assetId], ...patch } }));
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage("Link copied");
    } catch { setCopyMessage("Select and copy the URL from your browser"); }
    setTimeout(() => setCopyMessage(""), 2200);
  }
  async function uploadMore(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    const form = new FormData(); Array.from(list).forEach(f => form.append("files", f, f.name));
    setUploadBusy(true); setError("");
    try {
      const response = await fetch("/api/reviews/" + reviewId + "/files", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setData(old => ({ ...old, assets: [...old.assets, ...data.assets] }));
      if (!active) setActiveId(data.assets[0]?.id || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add files."); }
    finally { setUploadBusy(false); e.target.value = ""; }
  }
  async function removeAsset(asset: Asset) {
    if (confirmRemoveId !== asset.id) { setConfirmRemoveId(asset.id); return; }
    try {
      const response = await fetch("/api/reviews/" + reviewId + "/files/" + asset.id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove asset");
      setData(old => ({ ...old, assets: old.assets.filter(a => a.id !== asset.id) }));
      if (activeId === asset.id) setActiveId(review?.assets.find(a => a.id !== asset.id)?.id || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove asset."); }
    finally { setConfirmRemoveId(""); }
  }

  function addStroke(assetId: string, stroke: Stroke) {
    const item = review?.assets.find(a => a.id === assetId);
    if (!item) return;
    updateAsset(assetId, { strokes: [...item.strokes, stroke] });
  }
  function addTimeNote() {
    if (!active || !timeNoteText.trim()) return;
    const note: TimeNote = { id: id(), timestampSec: currentTime, text: timeNoteText.trim().slice(0, 2000), createdAt: new Date().toISOString() };
    updateAsset(active.id, { timeNotes: [...active.timeNotes, note] });
    setTimeNoteText("");
  }
  function removeTimeNote(noteId: string) {
    if (!active) return;
    updateAsset(active.id, { timeNotes: active.timeNotes.filter(n => n.id !== noteId) });
  }
  function addRule() {
    if (!review || !ruleName.trim()) return;
    const item: QAItem = { id: id(), name: ruleName.trim().slice(0, 160), description: ruleDescription.trim().slice(0, 1000), enabled: true, severity: ruleSeverity, appliesTo: ["all"] };
    setData(old => ({ ...old, rules: [...old.rules, item] }));
    setRuleName(""); setRuleDescription(""); setShowNewRule(false);
  }
  function updateRule(ruleId: string, patch: Partial<QAItem>) {
    setData(old => ({ ...old, rules: old.rules.map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule) }));
  }
  function removeRule(ruleId: string) { setData(old => ({ ...old, rules: old.rules.filter(rule => rule.id !== ruleId })); }

  async function runQA() {
    if (!review || !active) return;
    setRunBusy(true); setError("");
    const checkedAt = new Date().toISOString();
    let results: QAResult[] = [];
    try {
      if (active.kind === "html5-zip") {
        const response = await fetch(active.fileUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not read this ZIP file.");
        const blob = await response.blob();
        const report = await analyzeZip(new File([blob], active.originalName, { type: "application/zip" }), 150 * 1024);
        results = report.findings.map(f => ({
          ruleId: f.id,
          status: f.status === "PASS" ? "pass" : f.status === "FAIL" ? "fail" : f.status === "WARN" ? "review" : "na",
          detail: f.title + ": " + f.detail + (f.evidence ? "\n" + f.evidence : ""), checkedAt
        }));
        results.push(...review.rules.filter(r => r.enabled && !["file-size", "extension", "html5-entry"].includes(r.id)).map(r => ({
          ruleId: r.id, status: "review" as const, detail: "Manual review required: " + r.description, checkedAt
        })));
      } else {
        for (const rule of review.rules.filter(r => r.enabled && applicable(r, active))) {
          let status: QAResult["status"] = "review", detail = "Manual review required.";
          if (rule.id === "file-size") {
            const limit = thresholdBytes(active.kind);
            status = active.size <= limit ? "pass" : "fail";
            detail = niceSize(active.size) + " / default limit " + niceSize(limit) + (active.kind === "html5-zip" ? " (150 KB default)" : "");
          } else if (rule.id === "extension") {
            status = active.kind === "unknown" ? "review" : "pass";
            detail = active.kind === "unknown" ? "Unrecognized extension; verify the expected delivery format." : "Detected as " + KIND_LABEL[active.kind] + " (" + active.extension + ").";
          } else if (rule.id === "dimensions") {
            const meta = metadata[active.id];
            status = meta?.width && meta.height ? "review" : "review";
            detail = meta?.width && meta.height ? "Detected " + meta.width + " × " + meta.height + " px. Compare with the brief." : "Load the preview to read dimensions, then confirm against the brief.";
          } else if (rule.id === "video-playback") {
            const meta = metadata[active.id];
            status = active.kind === "video" && meta?.duration ? "pass" : "review";
            detail = meta?.duration ? "Browser loaded video metadata; duration " + fmtTime(meta.duration) + ". Play it through to confirm." : "Play the video and check that it plays and seeks correctly.";
          } else if (rule.id === "pdf-pages") {
            status = "review"; detail = "Preview the PDF and inspect the required pages.";
          } else {
            status = "review"; detail = rule.description || "Review manually against the brief.";
          }
          results.push({ ruleId: rule.id, status, detail, checkedAt });
        }
      }
      updateAsset(active.id, { qaResults: results });
      setActiveTab("qa");
    } catch (e) {
      setError(e instanceof Error ? e.message : "QA could not complete.");
    } finally { setRunBusy(false); }
  }
  function setResult(ruleId: string, status: QAResult["status"]) {
    if (!active) return;
    const result = active.qaResults.find(r => r.ruleId === ruleId);
    const next: QAResult = { ruleId, status, detail: result?.detail || "Manually updated by reviewer.", checkedAt: new Date().toISOString() };
    updateAsset(active.id, { qaResults: [...active.qaResults.filter(r => r.ruleId !== ruleId), next] });
  }

  if (loading) return <main className="loadingScreen"><LoaderCircle size={28} className="spinning"/><b>Loading shared review…</b></main>;
  if (loadError || !review) return <main className="missingScreen"><ShieldCheck size={34}/><h1>Review unavailable</h1><p>{loadError || "This review could not be opened."}</p><a href="/">Create a new review</a></main>;

  const resultCount = (active?.qaResults || []).filter(r => r.status === "fail").length;
  return <main className="reviewShell">
    <header className="reviewTopbar">
      <a href="/" className="brand compactBrand"><span className="brandMark"><ShieldCheck size={20}/></span><span><b>WINSTON</b><small>QA INSPECTOR</small></span></a>
      <div className="reviewBread"><span>Shared reviews</span><b>›</b><strong>{review.title}</strong></div>
      <div className="topActions">
        <span className={"saveIndicator " + saveState}>{saveState === "saving" ? <LoaderCircle size={13} className="spinning"/> : saveState === "error" ? <CircleAlert size={13}/> : <CheckCircle2 size={13}/>} {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save error" : "All changes saved"}</span>
        <button type="button" className="button secondary smallButton" onClick={copyLink}><Copy size={14}/>{copyMessage || "Copy review link"}</button>
      </div>
    </header>
    <div className="reviewPage">
      <div className="reviewTitlebar">
        <div><div className="eyebrow">SHARED ASSET REVIEW · {review.assets.length} ASSET{review.assets.length === 1 ? "" : "S"}</div>
          <input className="titleInput" value={review.title} aria-label="Review title" onChange={e=>setData(old=>({...old,title:e.target.value}))}/>
          <div className="reviewSubline">Created {new Date(review.createdAt).toLocaleString()} {review.creatorName ? "· by "+review.creatorName : ""}</div>
        </div>
        <div className="titleActions">
          <label className="statusSelectLabel">OVERALL STATUS<select value={review.status} onChange={e=>setData(old=>({...old,status:e.target.value as ReviewStatus}))}>{Object.entries(STATUS_LABEL).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
          <button className="button secondary smallButton" type="button" onClick={()=>addInput.current?.click()} disabled={uploadBusy}><FilePlus2 size={15}/>{uploadBusy ? "Adding…" : "Add assets"}</button>
          <input ref={addInput} type="file" multiple hidden onChange={uploadMore} accept="*/*"/>
        </div>
      </div>

      <div className="reviewGrid">
        <aside className="assetSidebar">
          <div className="assetSidebarHead"><div><b>Assets</b><small>{review.assets.length} uploaded</small></div><button type="button" className="iconButton addAsset" aria-label="Add asset" onClick={()=>addInput.current?.click()}><Plus size={17}/></button></div>
          <input className="assetSearch" value={assetSearch} onChange={e=>setAssetSearch(e.target.value)} placeholder="Find an asset…"/>
          <div className="assetList">
            {visibleAssets.map(asset => {
              const Icon = KIND_ICON[asset.kind];
              return <button type="button" key={asset.id} className={"assetListItem " + (activeId === asset.id ? "active" : "")} onClick={()=>{setActiveId(asset.id);setCurrentTime(0);setAnnotating(false);setConfirmRemoveId("");}}>
                <span className={"assetThumb " + asset.kind}><Icon size={18}/></span><span className="assetListCopy"><b title={asset.originalName}>{asset.originalName}</b><small>{KIND_LABEL[asset.kind]} · {niceSize(asset.size)}</small><span className={"tinyStatus " + STATUS_CLASS[asset.status]}>{STATUS_LABEL[asset.status]}</span></span>
              </button>;
            })}
            {!visibleAssets.length && <p className="emptySearch">No assets match.</p>}
            {!review.assets.length && <div className="noAssets"><FilePlus2 size={25}/><p>No assets in this review.</p><button className="button secondary" onClick={()=>addInput.current?.click()}>Add files</button></div>}
          </div>
          <div className="sidebarFooter"><span className="onlineDot"/> Shared link access is enabled</div>
        </aside>

        <section className="reviewCenter">
          {error && <div className="errorBox inlineError"><CircleAlert size={15}/>{error}<button className="iconButton" onClick={()=>setError("")}><X size={14}/></button></div>}
          {!active ? <div className="emptyPreview"><FileImage size={38}/><h2>Select an asset</h2><p>Choose an asset on the left or upload a new one.</p></div> : <>
            <div className="previewHeader"><div className="previewFileTitle"><div className="eyebrow">ASSET PREVIEW</div><h2 title={active.originalName}>{active.originalName}</h2><p>{KIND_LABEL[active.kind]} · {niceSize(active.size)}{metadata[active.id]?.width ? " · "+metadata[active.id].width+" × "+metadata[active.id].height+" px" : ""}{metadata[active.id]?.duration ? " · "+fmtTime(metadata[active.id].duration) : ""}</p></div>
              <div className="previewHeaderActions"><a className="button secondary smallButton" href={active.fileUrl} download={active.originalName}><Download size={14}/> Original</a><button className={"button " + (annotating ? "toolActive" : "secondary") + " smallButton"} type="button" onClick={()=>setAnnotating(v=>!v)}><Pencil size={14}/>{annotating ? "Drawing on" : "Annotate"}</button></div>
            </div>
            <div className="drawToolbar">
              <div className="toolHelp">{annotating ? <><Pencil size={14}/> Draw directly on the preview · click and drag</> : <><Palette size={14}/> Select Annotate to mark up this asset</>}</div>
              {annotating && <div className="drawControls"><div className="colorChoices">{["#ff3b30","#ffb020","#18a76b","#1683ff","#ffffff"].map(c=><button key={c} type="button" aria-label={"Brush color "+c} title={c} className={"colorChoice " + (brushColor===c ? "chosen" : "")} style={{background:c}} onClick={()=>setBrushColor(c)}/>)}</div><label>Brush <input type="range" min="1" max="10" value={brushWidth} onChange={e=>setBrushWidth(Number(e.target.value))}/></label></div>}
            </div>
            <AssetViewer asset={active} annotating={annotating} brushColor={brushColor} brushWidth={brushWidth} onStroke={stroke=>addStroke(active.id,stroke)} onTimeChange={t=>setCurrentTime(t)} onMetadata={m=>updateMeta(active.id,m)} onError={setError}/>
            <div className="annotationLegend"><span><Pencil size={13}/> {active.strokes.length} drawing{active.strokes.length===1?"":"s"}</span><span><Clock3 size={13}/> {active.timeNotes.length} timestamp note{active.timeNotes.length===1?"":"s"}</span><span>Best-effort browser preview</span>{active.strokes.length>0&&<button type="button" className="linkButton" onClick={()=>updateAsset(active.id,{strokes:[]})}>Clear all drawings</button>}</div>

            <div className="reviewTabs"><button className={activeTab==="feedback"?"current":""} onClick={()=>setActiveTab("feedback")} type="button><MessageSquare size={16}/> Notes & feedback {active.note.trim()||active.timeNotes.length ? <span className="tabDot"/>:null}</button><button className={activeTab==="qa"?"current":""} onClick={()=>setActiveTab("qa")} type="button><ShieldCheck size={16}/> QA checks {active.qaResults.length ? <span className="tabCount">{active.qaResults.length}</span>:null}</button></div>
            {activeTab==="feedback" ? <div className="tabPanel feedbackPanel">
              <div className="assetStatusRow"><div><b>Asset status</b><small>Visible to everyone who has this review link.</small></div><select aria-label="Asset status" value={active.status} onChange={e=>updateAsset(active.id,{status:e.target.value as ReviewStatus})}>{Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              <label className="fieldBlock">Asset notes<textarea value={active.note} onChange={e=>updateAsset(active.id,{note:e.target.value})} placeholder="Add a comment for the creator: what to change, where to look, or what needs approval…"/></label>
              {(active.kind==="video"||active.kind==="html5-zip") && <div className="timestampComposer"><div className="timeStampNow"><Clock3 size={15}/><b>{fmtTime(currentTime)}</b><span>{active.kind==="video"?"Current video time":"Preview elapsed time"}</span></div><textarea value={timeNoteText} onChange={e=>setTimeNoteText(e.target.value)} placeholder="Add feedback at this moment…"/><button className="button secondary smallButton" disabled={!timeNoteText.trim()} onClick={addTimeNote} type="button><Plus size={14}/> Add timestamp note</button></div>}
              {active.timeNotes.length>0 && <div className="timeNotesList"><h3>Timestamp notes</h3>{active.timeNotes.slice().sort((a,b)=>a.timestampSec-b.timestampSec).map(n=><div className="timeNote" key={n.id}><button type="button" className="timecodeButton" onClick={()=>setCurrentTime(n.timestampSec)}><Play size={12}/>{fmtTime(n.timestampSec)}</button><p>{n.text}</p><button className="iconButton" type="button" aria-label="Remove note" onClick={()=>removeTimeNote(n.id)}><X size={13}/></button></div>)}</div>}
              <div className="overallNoteBlock"><label className="fieldBlock">Review brief / shared notes<textarea value={review.overallNote} onChange={e=>setData(old=>({...old,overallNote:e.target.value}))} placeholder="Project brief, delivery specs, deadline or shared reviewer instructions…"/></label></div>
            </div> : <div className="tabPanel qaPanel">
              <div className="qaToolbar"><div><b>QA inspection</b><small>Run the enabled rules on this asset, then mark any manual checks.</small></div><button type="button" className="button primary smallButton" disabled={runBusy} onClick={runQA}>{runBusy?<LoaderCircle size={14} className="spinning"/>:<ShieldCheck size={14}/>} {runBusy?"Running…":"Run QA"}</button></div>
              {active.kind==="html5-zip"&&<div className="qaBanner"><CircleAlert size={16}/><span>ZIP checks include package size, HTML entry point, click-through patterns and local resource references. Static checks cannot certify platform acceptance.</span></div>}
              <div className="qaRuleList">{review.rules.filter(r=>r.enabled&&applicable(r,active)).map(rule=>{
                const result=active.qaResults.find(r=>r.ruleId===rule.id);
                return <div className="qaRule" key={rule.id}><div className="ruleSeverity"><span className={"severityDot "+rule.severity}/></div><div className="qaRuleMain"><div className="qaRuleTitle"><b>{rule.name}</b><span className={"severityLabel "+rule.severity}>{rule.severity}</span></div><p>{result?.detail||rule.description}</p>{RULE_HINTS[rule.id]&&<small>{RULE_HINTS[rule.id]}</small>}
                  {result&&<div className={"resultStatus "+result.status}>{result.status==="pass"?<CheckCircle2 size={13}/>:result.status==="fail"?<XCircle size={13}/>:<CircleAlert size={13}/>} {result.status==="pass"?"Pass":result.status==="fail"?"Fail":result.status==="na"?"Not applicable":"Needs review"}</div>}
                  </div><div className="manualResult"><button type="button" title="Mark pass" aria-label={"Mark "+rule.name+" pass"} onClick={()=>setResult(rule.id,"pass")} className={result?.status==="pass"?"chosenPass":""}><Check size={14}/></button><button type="button" title="Needs changes" aria-label={"Mark "+rule.name+" needs changes"} onClick={()=>setResult(rule.id,"fail")} className={result?.status==="fail"?"chosenFail":""}><X size={14}/></button></div></div>;
              })}{!review.rules.some(r=>r.enabled&&applicable(r,active))&&<div className="emptyState">No enabled rules apply to this asset. Add or enable rules in the QA rules panel.</div>}</div>
              <div className="qaFootnote">Current findings: <b className={resultCount?"badCount":""}>{resultCount} failed</b> · Rule results are saved automatically with this review.</div>
            </div>}
          </>}
        </section>

        <aside className="rightPanel">
          <div className="rightPanelTop"><div><div className="eyebrow">REVIEW CONTROLS</div><h3>Collaboration</h3></div><Link2 size={18}/></div>
          <button className="shareAction" type="button" onClick={copyLink}><span className="shareIcon"><Copy size={17}/></span><span><b>Copy unique review link</b><small>Send to the asset creator</small></span><ArrowUpRight size={15}/></button>
          <div className="shareUrlBox"><small>SHARE URL</small><code>{url}</code><button onClick={copyLink} type="button"><Copy size={12}/>{copyMessage||"Copy URL"}</button></div>
          <div className="panelDivider"/>
          <div className="rightPanelTop rulesHeader"><div><div className="eyebrow">QUALITY CONTROL</div><h3>QA rules</h3></div><button className="iconButton" type="button" aria-label="Add QA rule" onClick={()=>setShowNewRule(v=>!v)}><Plus size={17}/></button></div>
          <p className="rulesIntro">Enable, disable, edit or add review criteria. Results are attached to the selected asset.</p>
          <div className="ruleManager">{review.rules.map(rule=><div className={"managedRule "+(!rule.enabled?"disabled":"")} key={rule.id}>
            <label className="toggle"><input type="checkbox" checked={rule.enabled} onChange={e=>updateRule(rule.id,{enabled:e.target.checked})}/><span/></label>
            <div className="managedRuleBody"><b>{rule.name}</b><small>{rule.description||"No description"}</small><span className={"severityLabel "+rule.severity}>{rule.severity}</span></div>
            {!DEFAULT_RULES.some(d=>d.id===rule.id)&&<button type="button" className="iconButton deleteRule" aria-label={"Delete "+rule.name} onClick={()=>setData(old=>({...old,rules:old.rules.filter(r=>r.id!==rule.id)}))}><Trash2 size={13}/></button>}
          </div>)}</div>
          {showNewRule&&<div className="newRuleForm"><h4>New QA rule</h4><label>Name<input value={ruleName} onChange={e=>setRuleName(e.target.value)} placeholder="e.g. Legal copy present"/></label><label>What to check<textarea value={ruleDescription} onChange={e=>setRuleDescription(e.target.value)} placeholder="Describe the acceptance criteria…"/></label><label>Severity<select value={ruleSeverity} onChange={e=>setRuleSeverity(e.target.value as RuleSeverity)}><option value="blocker">Blocker</option><option value="warning">Warning</option><option value="info">Info</option></select></label><div className="formButtons"><button type="button" className="button secondary smallButton" onClick={()=>setShowNewRule(false)}>Cancel</button><button type="button" className="button primary smallButton" onClick={addRule} disabled={!ruleName.trim()}><Plus size={13}/> Add rule</button></div></div>}
          <div className="ruleHelp"><ShieldCheck size={16}/><p><b>Rules are a checklist, not certification.</b><br/>Use objective rules for file checks and manual results for creative, brand, legal and platform requirements.</p></div>
          {active&&<><div className="panelDivider"/><div className="assetActions"><h3>Selected asset</h3><div><span>Review status</span><strong className={"statusText "+STATUS_CLASS[active.status]}>{STATUS_LABEL[active.status]}</strong></div><div><span>Uploaded</span><strong>{new Date(active.uploadedAt).toLocaleDateString()}</strong></div><div><span>File size</span><strong>{niceSize(active.size)}</strong></div><button className="removeAssetButton" type="button" onClick={()=>removeAsset(active)}><Trash2 size={14}/>{confirmRemoveId===active.id?"Confirm remove asset":"Remove asset"}</button>{confirmRemoveId===active.id&&<small className="removeConfirm">Click again to permanently remove this asset from the review.</small>}</div></>}
        </aside>
      </div>
      <footer className="footer reviewFooter"><span>WINSTON QA INSPECTOR · SHARED REVIEW</span><span>{saveState==="saved"?<><CheckCircle2 size={13}/> Saved on server</>:saveState==="saving"?<><LoaderCircle size={13} className="spinning"/> Saving changes…</>:<><CircleAlert size={13}/> Save failed — check connection</>}</span></footer>
    </div>
  </main>;
}

function AssetViewer({ asset, annotating, brushColor, brushWidth, onStroke, onTimeChange, onMetadata, onError }: {
  asset: Asset; annotating: boolean; brushColor: string; brushWidth: number;
  onStroke: (stroke: Stroke) => void; onTimeChange: (sec: number) => void;
  onMetadata: (meta: MediaMeta) => void; onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewElapsed, setPreviewElapsed] = useState(0);
  const [ratio, setRatio] = useState(16 / 9);
  const [loadingZip, setLoadingZip] = useState(false);
  const [zipHtml, setZipHtml] = useState("");
  const [zipError, setZipError] = useState("");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setCurrentTime(0); setPreviewElapsed(0); onTimeChange(0); setZipHtml(""); setZipError(""); startedAt.current = Date.now();
  }, [asset.id, onTimeChange]);

  useEffect(() => {
    if (asset.kind !== "html5-zip") return;
    let cancelled = false; let urls: string[] = [];
    setLoadingZip(true); setZipHtml(""); setZipError("");
    (async () => {
      const response = await fetch(asset.fileUrl);
      if (!response.ok) throw new Error("The uploaded ZIP could not be read.");
      const archive = await JSZip.loadAsync(await response.arrayBuffer());
      const entries = Object.values(archive.files).filter(e=>!e.dir && !e.name.startsWith("__MACOSX/"));
      const html = entries.filter(e=>/\.html?$/i.test(e.name)).sort((a,b)=>(a.name.includes("/")?1:0)-(b.name.includes("/")?1:0))[0];
      if (!html) throw new Error("No HTML entry point was found in this ZIP.");
      const map = new Map<string,string>();
      const mimetype = (p: string) => {
        const ext=p.split(".").pop()?.toLowerCase();
        const types: Record<string,string>={html:"text/html",htm:"text/html",css:"text/css",js:"text/javascript",mjs:"text/javascript",json:"application/json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",svg:"image/svg+xml",webp:"image/webp",avif:"image/avif",mp4:"video/mp4",webm:"video/webm",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf"};
        return types[ext||""]||"application/octet-stream";
      };
      for (const entry of entries) {
        if (entry.name===html.name) continue;
        const blob = await entry.async("blob");
        const typed = new Blob([blob],{type:mimetype(entry.name)});
        const u=URL.createObjectURL(typed); urls.push(u); map.set(entry.name,u);
      }
      const normalize = (ref: string, base: string) => {
        try {
          const clean=decodeURIComponent(ref.split("#")[0].split("?")[0]);
          if (!clean || /^(https?:|data:|blob:|javascript:|mailto:|tel:|\/\/)/i.test(clean) || clean.startsWith("#")) return null;
          const parts=(clean.startsWith("/")?clean.replace(/^\//,""):base.split("/").slice(0,-1).concat(clean.split("/")).join("/")).split("/");
          const out:string[]=[];
          parts.forEach(p=>{if(p===".." )out.pop();else if(p&&p!==".")out.push(p);});
          return out.join("/");
        } catch { return null; }
      };
      const cssEntries=entries.filter(e=>/\.css$/i.test(e.name));
      for (const entry of cssEntries) {
        const css=await entry.async("string");
        const rewritten=css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,(full,_q:string,ref:string)=>{
          const target=normalize(ref,entry.name); return target&&map.has(target)?"url('"+map.get(target)+"')":full;
        });
        const replacement=URL.createObjectURL(new Blob([rewritten],{type:"text/css"})); urls.push(replacement); map.set(entry.name,replacement);
      }
      let source=await html.async("string");
      source=source.replace(/<base\b[^>]*>/gi,"");
      source=source.replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi,(full,attr:string,q:string,ref:string)=>{
        if (/^(https?:|data:|blob:|javascript:|mailto:|tel:|\/\/|#)/i.test(ref)) return full;
        const target=normalize(ref,html.name); return target&&map.has(target)?attr+"="+q+map.get(target)+q:full;
      });
      source=source.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,(full,_q:string,ref:string)=>{
        const target=normalize(ref,html.name); return target&&map.has(target)?"url('"+map.get(target)+"')":full;
      });
      const csp="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; style-src 'self' 'unsafe-inline' blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'none'; object-src 'none'; form-action 'none'\">";
      if (/<head[^>]*>/i.test(source)) source=source.replace(/<head([^>]*)>/i,"<head$1>"+csp);
      else source="<!doctype html><html><head>"+csp+"</head><body>"+source+"</body></html>";
      if (!cancelled) setZipHtml(source);
    })().catch(e=>{if(!cancelled)setZipError(e instanceof Error?e.message:"Could not preview ZIP contents.");})
      .finally(()=>{if(!cancelled)setLoadingZip(false);});
    return ()=>{cancelled=true;urls.forEach(URL.revokeObjectURL);};
  }, [asset.id, asset.fileUrl, asset.kind]);

  useEffect(() => {
    if (asset.kind !== "html5-zip") return;
    const timer=setInterval(()=>{const elapsed=(Date.now()-startedAt.current)/1000;setPreviewElapsed(elapsed);onTimeChange(elapsed);},500);
    return ()=>clearInterval(timer);
  }, [asset.id, asset.kind, onTimeChange]);

  const onVideoTime = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const t=e.currentTarget.currentTime; setCurrentTime(t); onTimeChange(t);
  };
  const metaImage=(e: React.SyntheticEvent<HTMLImageElement>)=>{const el=e.currentTarget;setRatio(el.naturalWidth&&el.naturalHeight?el.naturalWidth/el.naturalHeight:16/9);onMetadata({width:el.naturalWidth,height:el.naturalHeight,loaded:true});};
  const videoMeta=(e: React.SyntheticEvent<HTMLVideoElement>)=>{const el=e.currentTarget;setRatio(el.videoWidth&&el.videoHeight?el.videoWidth/el.videoHeight:16/9);onMetadata({width:el.videoWidth,height:el.videoHeight,duration:el.duration,loaded:true});};

  if (asset.kind==="image"||asset.kind==="gif") return <div className="assetStageOuter"><div className="assetStage imageStage" style={{aspectRatio:ratio,maxWidth:"min(100%, calc(62vh * "+ratio+"))"}}><img className="assetMedia" src={asset.fileUrl} alt={asset.originalName} onLoad={metaImage} onError={()=>onError("Image preview failed. The file may be corrupt or use an unsupported codec.")}/><AnnotationLayer key={asset.id} strokes={asset.strokes} annotate={annotating} color={brushColor} width={brushWidth} timestamp={null} activeTime={null} onStroke={onStroke}/></div></div>;
  if (asset.kind==="video") return <div className="assetStageOuter"><div className="assetStage" style={{aspectRatio:ratio,maxWidth:"min(100%, calc(62vh * "+ratio+"))"}}><video ref={videoRef} className="assetMedia" src={asset.fileUrl} controls playsInline preload="metadata" onTimeUpdate={onVideoTime} onLoadedMetadata={videoMeta} onError={()=>onError("Video preview failed. This browser may not support the codec or container.")}/><AnnotationLayer key={asset.id} strokes={asset.strokes} annotate={annotating} color={brushColor} width={brushWidth} timestamp={currentTime} activeTime={currentTime} onStroke={onStroke}/></div><div className="videoTimeBar"><span><Video size={14}/> {fmtTime(currentTime)}</span><span>{metadataDurationText(videoRef.current?.duration)}</span><input type="range" aria-label="Seek video" min="0" max={Number.isFinite(videoRef.current?.duration)?videoRef.current!.duration:0} step=".1" value={Number.isFinite(videoRef.current?.duration)?Math.min(currentTime,videoRef.current!.duration):0} onChange={e=>{if(videoRef.current){videoRef.current.currentTime=Number(e.target.value);setCurrentTime(Number(e.target.value));onTimeChange(Number(e.target.value));}}}/></div></div>;
  if (asset.kind==="audio") return <div className="audioStage"><div className="audioArtwork"><FileAudio size={42}/></div><h3>{asset.originalName}</h3><p>{niceSize(asset.size)} · Audio file</p><audio src={asset.fileUrl} controls onLoadedMetadata={e=>onMetadata({duration:e.currentTarget.duration,loaded:true})} onError={()=>onError("Audio preview failed. This browser may not support the codec.")}/><div className="audioHint">Check the full playback, levels and content against your brief.</div></div>;
  if (asset.kind==="pdf") return <div className="pdfStage"><iframe title={"PDF preview: "+asset.originalName} src={asset.fileUrl} onLoad={()=>onMetadata({loaded:true})}/></div>;
  if (asset.kind==="html5-zip") return <div className="assetStageOuter"><div className="assetStage htmlStage" style={{aspectRatio:"16/9"}}>{loadingZip?<div className="viewerMessage"><LoaderCircle size={23} className="spinning"/>Unpacking creative for isolated preview…</div>:zipError?<div className="viewerMessage"><CircleAlert size={23}/><b>Preview unavailable</b><p>{zipError}</p><a href={asset.fileUrl} download={asset.originalName}>Download the original ZIP</a></div>:<><iframe className="htmlPreview" title={"HTML5 preview: "+asset.originalName} sandbox="allow-scripts allow-forms" srcDoc={zipHtml}/><AnnotationLayer key={asset.id} strokes={asset.strokes} annotate={annotating} color={brushColor} width={brushWidth} timestamp={previewElapsed} activeTime={previewElapsed} onStroke={onStroke}/></>}</div><div className="viewerCaption"><span><ShieldCheck size={13}/> Isolated sandbox preview; some creatives may behave differently from the ad platform.</span><a href={asset.fileUrl} download={asset.originalName}>Download ZIP</a></div></div>;
  if (asset.kind==="document") return <div className="unsupportedStage"><FileText size={40}/><h3>Document received</h3><p>This format is stored with the review. Inline preview is not available for this office document type.</p><a className="button secondary smallButton" href={asset.fileUrl} download={asset.originalName}><Download size={14}/> Download document</a></div>;
  return <div className="unsupportedStage"><FileText size={40}/><h3>File stored for review</h3><p>No inline preview is available for this format. The file can still have notes, QA status and a unique review link.</p><a className="button secondary smallButton" href={asset.fileUrl} download={asset.originalName}><Download size={14}/> Download original</a></div>;
}

function metadataDurationText(value: number | undefined) { return value && Number.isFinite(value) ? fmtTime(value) : "Duration pending"; }

function AnnotationLayer({ strokes, annotate, color, width, timestamp, activeTime, onStroke }: {
  strokes: Stroke[]; annotate: boolean; color: string; width: number; timestamp: number | null; activeTime: number | null;
  onStroke: (stroke: Stroke) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size,setSize] = useState({w:0,h:0});
  const [draft,setDraft] = useState<Stroke|null>(null);
  const active = useRef<Stroke|null>(null);

  useEffect(()=>{
    if(!stage.current)return;
    const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setSize({w:rect.width,h:rect.height});});
    observer.observe(stage.current);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const c=canvas.current;if(!c||size.w<1||size.h<1)return;
    const dpr=window.devicePixelRatio||1;c.width=Math.round(size.w*dpr);c.height=Math.round(size.h*dpr);
    const ctx=c.getContext("2d");if(!ctx)return;ctx.scale(dpr,dpr);ctx.clearRect(0,0,size.w,size.h);
    const all=[...strokes,...(draft?[draft]:[])];
    for(const s of all){
      if(s.timestampSec!==null&&activeTime!==null&&Math.abs(activeTime-s.timestampSec)>1.2)continue;
      if(s.timestampSec!==null&&activeTime===null)continue;
      if(s.points.length===0)continue;
      ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap="round";ctx.lineJoin="round";
      ctx.beginPath();ctx.moveTo(s.points[0].x*size.w,s.points[0].y*size.h);
      for(const p of s.points.slice(1))ctx.lineTo(p.x*size.w,p.y*size.h);
      if(s.points.length===1){ctx.lineTo(s.points[0].x*size.w+.01,s.points[0].y*size.h+.01);}
      ctx.stroke();
    }
  },[strokes,draft,size,activeTime]);
  const point=(e:PointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};};
  const down=(e:PointerEvent<HTMLCanvasElement>)=>{if(!annotate)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);const s:Stroke={id:id(),points:[p],color,width,timestampSec:timestamp,createdAt:new Date().toISOString()};active.current=s;setDraft(s);};
  const move=(e:PointerEvent<HTMLCanvasElement>)=>{if(!active.current)return;e.preventDefault();const p=point(e);const s={...active.current,points:[...active.current.points,p]};active.current=s;setDraft(s);};
  const up=()=>{if(active.current){onStroke(active.current);active.current=null;setDraft(null);}};
  return <><div ref={stage} className="annotationStage"><canvas ref={canvas} className={"annotationCanvas "+(annotate?"drawing":"")} aria-label={annotate?"Draw feedback marks on the preview":"Preview annotations"} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/></div></>;
}

function HtmlStageFallback() { return <div className="viewerMessage">No HTML file found.</div>; }
