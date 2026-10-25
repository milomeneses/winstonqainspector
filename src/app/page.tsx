"use client";

import { useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, CloudUpload, Download, FileArchive, FileSearch, FolderOpen, HardDrive, ShieldCheck, XCircle } from "lucide-react";
import { analyzeZip, formatBytes, type Finding, type QAReport, type Status } from "@/lib/qa";
import { downloadCsv, downloadJson } from "@/lib/report";

const statusMeta: Record<Status, { label: string; className: string }> = {
  PASS: { label: "PASS", className: "pass" },
  WARN: { label: "WARNING", className: "warn" },
  FAIL: { label: "FAIL", className: "fail" },
  INFO: { label: "INFO", className: "info" },
};

function StatusPill({ status }: { status: Status }) {
  return <span className={"status-pill " + statusMeta[status].className}>{statusMeta[status].label}</span>;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<QAReport | null>(null);
  const [maxMB, setMaxMB] = useState("150");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  function onFiles(list: FileList | null) {
    const picked = list && list[0];
    if (!picked) return;
    setFile(picked);
    setReport(null);
    setError("");
    setSelected(null);
  }

  async function runQA() {
    if (!file) { setError("Choose an HTML5 ZIP first."); return; }
    setBusy(true); setError(""); setReport(null);
    try {
      const limit = Math.max(1, Number(maxMB) || 150) * 1024 * 1024;
      const result = await analyzeZip(file, limit);
      setReport(result);
      setSelected(result.findings[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "QA scan failed.");
    } finally { setBusy(false); }
  }

  const visible = report?.findings.filter(f =>
    (f.title + " " + f.detail + " " + (f.evidence || "")).toLowerCase().includes(query.toLowerCase())
  ) || [];
  const passes = report?.findings.filter(f => f.status === "PASS").length || 0;
  const warns = report?.findings.filter(f => f.status === "WARN").length || 0;
  const fails = report?.findings.filter(f => f.status === "FAIL").length || 0;
  const chosen: Finding | undefined = report?.findings.find(f => f.id === selected);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={23} /></div>
          <div><strong>WINSTON</strong><span>QA INSPECTOR</span></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-item active"><FileSearch size={17} /> Banner preflight <span className="nav-count">01</span></div>
        <div className="nav-item muted"><HardDrive size={17} /> File inspector <span className="soon">SOON</span></div>
        <div className="nav-item muted"><Activity size={17} /> Google Drive <span className="soon">SOON</span></div>
        <div className="sidebar-bottom">
          <div className="local-card"><span className="green-dot" /><div><b>Local processing</b><small>ZIP stays in this browser</small></div></div>
          <div className="version">WINSTON QA <span>v0.1.0 MVP</span></div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <b>Banner preflight</b></div>
          <div className="top-right"><span className="secure-label"><span className="green-dot" /> LOCAL MODE</span><div className="avatar">W</div></div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">AD OPERATIONS / QUALITY CONTROL</div>
              <h1>Banner preflight</h1>
              <p>Inspect HTML5 creatives before they reach the ad server.</p>
            </div>
            <div className="heading-badge"><Activity size={16} /> PRE-FLIGHT ENGINE <span>· MVP</span></div>
          </div>

          <section className="panel upload-card">
            <div className="section-header">
              <div className="section-icon"><FileArchive size={19} /></div>
              <div><h2>Creative package</h2><p>Upload a ZIP package to run static QA checks.</p></div>
              <span className="step">STEP 01</span>
            </div>
            <div className={"dropzone " + (file ? "has-file" : "")}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
              <input ref={inputRef} type="file" accept=".zip,application/zip" hidden onChange={e => onFiles(e.target.files)} />
              <div className="upload-icon"><CloudUpload size={25} /></div>
              {file ? <>
                <b>{file.name}</b><span>{formatBytes(file.size)} · Ready to inspect</span>
                <button className="text-button" type="button" onClick={() => { setFile(null); setReport(null); setError(""); }}>Remove file</button>
              </> : <>
                <b>Drop your HTML5 ZIP here</b><span>or browse files from your computer</span>
                <button className="browse-button" type="button" onClick={() => inputRef.current?.click()}><FolderOpen size={16} /> Browse ZIP package</button>
                <small>ZIP archive · local processing · no upload</small>
              </>}
            </div>
            <div className="options-row">
              <label htmlFor="max-size">Maximum ZIP size</label>
              <div className="limit-control"><input id="max-size" value={maxMB} onChange={e => setMaxMB(e.target.value)} inputMode="numeric" /><span>MB</span></div>
              <button className="primary-button" type="button" disabled={!file || busy} onClick={runQA}>
                {busy ? <span className="spinner" /> : <FileSearch size={17} />} {busy ? "Inspecting package..." : "Run QA inspection"}
              </button>
            </div>
            {error && <div className="error-banner"><AlertTriangle size={17} /> {error}</div>}
          </section>

          {report && <>
            <div className="report-heading">
              <div><div className="eyebrow">INSPECTION RESULTS</div><h2>QA report</h2><p>{report.fileName} · {new Date(report.createdAt).toLocaleString()}</p></div>
              <div className="export-actions">
                <button type="button" className="secondary-button" onClick={() => downloadCsv(report)}><Download size={15} /> Export CSV</button>
                <button type="button" className="secondary-button" onClick={() => downloadJson(report)}><Download size={15} /> Export JSON</button>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card"><span>PACKAGE SIZE</span><strong>{formatBytes(report.zipBytes)}</strong><small>Limit: {maxMB || "150"} MB</small></div>
              <div className="stat-card"><span>CHECKS PASSED</span><strong className="stat-green">{passes}</strong><small>Meets simple static checks</small></div>
              <div className="stat-card"><span>WARNINGS</span><strong className="stat-amber">{warns}</strong><small>Review before delivery</small></div>
              <div className="stat-card"><span>FAILURES</span><strong className="stat-red">{fails}</strong><small>Potential blockers</small></div>
            </div>

            <div className="results-grid">
              <section className="panel findings-panel">
                <div className="panel-title"><div><h2>Findings</h2><p>{report.findings.length} checks performed</p></div><input className="search-input" placeholder="Filter checks..." value={query} onChange={e => setQuery(e.target.value)} /></div>
                <div className="finding-list">
                  {visible.map(f => <button type="button" key={f.id} className={"finding-row " + (selected === f.id ? "selected" : "")} onClick={() => setSelected(f.id)}>
                    <span className={"finding-icon " + statusMeta[f.status].className}>
                      {f.status === "PASS" ? <CheckCircle2 size={17} /> : f.status === "FAIL" ? <XCircle size={17} /> : <AlertTriangle size={17} />}
                    </span>
                    <span className="finding-copy"><b>{f.title}</b><small>{f.detail}</small></span>
                    <StatusPill status={f.status} />
                  </button>)}
                  {!visible.length && <div className="empty-state">No checks match this filter.</div>}
                </div>
              </section>

              <div className="right-stack">
                <section className="panel detail-panel">
                  <div className="eyebrow">CHECK DETAILS</div>
                  {chosen ? <>
                    <h2>{chosen.title}</h2>
                    <StatusPill status={chosen.status} />
                    <p>{chosen.detail}</p>
                    {chosen.evidence && <pre className="evidence">{chosen.evidence}</pre>}
                  </> : <p>Select a finding to see its details.</p>}
                </section>
                <section className="panel package-panel">
                  <div className="section-header compact"><div className="section-icon"><FileArchive size={17} /></div><div><h2>Package contents</h2><p>{report.files.length} files listed</p></div></div>
                  <div className="file-list">{report.files.slice(0, 10).map(f => <div className="file-row" key={f.name}><span className="file-ext">{f.type.slice(0, 4).toUpperCase()}</span><span title={f.name}>{f.name}</span></div>)}
                    {report.files.length > 10 && <small className="file-more">+ {report.files.length - 10} more files · included in export</small>}
                  </div>
                  <div className="platforms"><b>Possible platform profile</b>{report.detectedPlatforms.map(p => <span key={p}>{p}</span>)}</div>
                </section>
              </div>
            </div>
            <p className="disclaimer">Static preflight only. Results are heuristic and do not certify platform acceptance or execute the banner. Always test the creative in the target ad platform.</p>
          </>}
          <footer><span>WINSTON QA INSPECTOR</span><span><span className="green-dot" /> Files are analyzed in your browser</span></footer>
        </div>
      </section>
    </main>
  );
}
