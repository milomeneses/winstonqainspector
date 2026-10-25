"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, FilePlus2, FolderOpen, ShieldCheck, UploadCloud, X } from "lucide-react";

const MAX_FILE = 100 * 1024 * 1024;
const MAX_TOTAL = 250 * 1024 * 1024;
const accept = ".zip,.html,.htm,.jpg,.jpeg,.png,.webp,.avif,.svg,.gif,.mp4,.mov,.webm,.m4v,.mp3,.wav,.m4a,.ogg,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf";

function human(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  const u = ["KB", "MB", "GB"]; let n = bytes / 1024, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + " " + u[i];
}

export default function Home() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addFiles(incoming: FileList | File[]) {
    const next = Array.from(incoming);
    setFiles(old => {
      const map = new Map<string, File>();
      [...old, ...next].forEach(f => map.set(f.name + ":" + f.size + ":" + f.lastModified, f));
      return Array.from(map.values());
    });
    setError("");
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }
  function onSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }
  const total = files.reduce((n, f) => n + f.size, 0);

  async function createReview() {
    setError("");
    if (!files.length) { setError("Agregá al menos un archivo."); return; }
    const tooLarge = files.find(f => f.size > MAX_FILE);
    if (tooLarge) { setError(tooLarge.name + " supera el límite de 100 MB por archivo."); return; }
    if (total > MAX_TOTAL) { setError("La carga combinada supera el límite de 250 MB por revisión."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("title", title.trim() || files[0].name + (files.length > 1 ? " · asset review" : ""));
      form.set("creatorName", creator);
      form.set("overallNote", note);
      files.forEach(file => form.append("files", file, file.name));
      const response = await fetch("/api/reviews", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo crear la revisión.");
      router.push(payload.shareUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la revisión. Revisá la conexión e intentá otra vez.");
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brandMark"><ShieldCheck size={22}/></span><span><b>WINSTON</b><small>QA INSPECTOR</small></span></a>
      <div className="sideLabel">WORKSPACE</div>
      <div className="sideItem selected"><FilePlus2 size={17}/> New asset review</div>
      <div className="sideHint">Create one unique review link for your asset creator, designer or QA partner.</div>
      <div className="sideBottom"><span className="onlineDot"/> <span><b>Review links enabled</b><small>Shared review + feedback</small></span></div>
    </aside>
    <section className="main">
      <header className="topbar"><div>Workspace <span>›</span> <b>New review</b></div><span className="topPill"><span className="onlineDot"/> SHAREABLE REVIEWS</span></header>
      <div className="content">
        <div className="hero">
          <div className="eyebrow">CREATIVE OPERATIONS / QA</div>
          <h1>Every asset. One review link.</h1>
          <p>Upload creatives, apply QA rules, add timestamped feedback and send one link to the asset creator.</p>
        </div>
        <div className="columns">
          <section className="card createCard">
            <div className="cardHead"><div><h2>Create a review</h2><p>Start with one file or a complete creative package.</p></div><span className="stepTag">01 / UPLOAD</span></div>
            <div className="drop" onDragOver={e=>e.preventDefault()} onDrop={onDrop}>
              <input ref={input} hidden type="file" multiple accept={accept} onChange={onSelect}/>
              <div className="dropIcon"><UploadCloud size={27}/></div>
              <b>Drop assets here</b>
              <p>Images, GIFs, video, audio, PDF, HTML files and HTML5 ZIP banners.</p>
              <button className="button secondary" type="button" onClick={()=>input.current?.click()}><FolderOpen size={16}/> Browse files</button>
              <small>Maximum 100 MB per file · 250 MB combined per review</small>
            </div>
            {files.length > 0 && <div className="queue">
              <div className="queueTop"><b>{files.length} {files.length === 1 ? "file" : "files"} selected</b><span>{human(total)} total</span><button className="linkButton" onClick={()=>setFiles([])} type="button">Clear all</button></div>
              {files.map((file, i)=><div className="queuedFile" key={file.name+file.size+i}><span className="queuedIcon">{file.name.split(".").pop()?.toUpperCase().slice(0,4)}</span><span className="queuedName" title={file.name}>{file.name}<small>{human(file.size)} · {file.type || "file type to detect"}</small></span><button className="iconButton" aria-label={"Remove "+file.name} type="button" onClick={()=>setFiles(old=>old.filter((_,idx)=>idx!==i))}><X size={15}/></button></div>)}
            </div>}
            <div className="fieldGrid">
              <label>Review title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Campaign / project / asset version"/></label>
              <label>Your name or team<input value={creator} onChange={e=>setCreator(e.target.value)} placeholder="e.g. Creative QA"/></label>
            </div>
            <label className="fieldBlock">Brief / overall notes<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add the brief, specifications, deadline or context for the asset creator…"/></label>
            {error && <div className="errorBox">{error}</div>}
            <button type="button" className="button primary createButton" disabled={busy || files.length===0} onClick={createReview}>{busy ? <><span className="spinner"/> Creating review…</> : <><Check size={17}/> Create review link <ArrowUpRight size={16}/></>}</button>
          </section>
          <aside className="rightCol">
            <section className="card featureCard"><span className="featureBadge">BUILT FOR CREATIVE QA</span><h2>From upload to actionable feedback.</h2>
              <div className="featureRow"><span className="featureNum">01</span><div><b>Multi-format previews</b><p>Review JPG, PNG, GIF, MP4, PDF and zipped HTML5 banners in one place.</p></div></div>
              <div className="featureRow"><span className="featureNum">02</span><div><b>Draw where it matters</b><p>Pin comments and draw directly over the preview. Video comments include timestamps.</p></div></div>
              <div className="featureRow"><span className="featureNum">03</span><div><b>Share one unique link</b><p>Send the review URL to the creator. Notes, QA findings and status are saved with the review.</p></div></div>
            </section>
            <section className="noticeCard"><b>Link access</b><p>Anyone who has a review URL can open and edit that review. Treat the link as a private bearer link and share it only with people involved in the project.</p></section>
          </aside>
        </div>
        <footer className="footer"><span>WINSTON QA INSPECTOR · MVP</span><span><span className="onlineDot"/> Review data is stored by the application server</span></footer>
      </div>
    </section>
  </main>;
}
