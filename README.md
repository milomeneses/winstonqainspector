# Winston QA Inspector

A multi-format creative QA and feedback workspace built with Next.js, TypeScript, React and JSZip.

## Current features

- Create a unique, shareable review URL for an asset or a set of assets.
- Upload images (JPG/JPEG, PNG, WEBP, AVIF, SVG, GIF), video (MP4, MOV, WEBM and similar), audio, PDF, office documents, standalone HTML and HTML5 ZIP packages.
- Preview image/GIF/video/audio/PDF and provide sandboxed best-effort previews for HTML/HTML5 ZIP creatives.
- Shared review title, project brief, per-asset notes and review status.
- Draw annotations over image, GIF, video and HTML5 ZIP previews. Video marks are time-coded; timestamp notes can be added and video notes seek to their time.
- Enable/disable standard QA rules, add custom QA rules and record pass/fail/manual-review outcomes.
- Static HTML5 ZIP checks: package size, root HTML, click-through pattern, external URL references and possible missing local references.
- Download the original asset and remove assets from a review.
- Autosave review notes, strokes, timestamp notes, statuses, rules and QA results to the application server.

## Run locally

Requirements: Node.js 22 LTS recommended.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Production build

```bash
npm install
npm run build
npm run start
```

See [hostinger-deploy.md](./hostinger-deploy.md) for Hostinger notes.

## Upload limits

- 100 MB per file and 250 MB combined per review in this MVP.
- The default HTML5 ZIP QA threshold is 149,999 bytes (153,600 bytes). This is an editable product default, not a universal advertising-platform requirement.
- Other default size thresholds: image/GIF 5 MB, video 50 MB, PDF 20 MB, other assets 20 MB. Team/project specs may be stricter.

## Sharing, storage and privacy

The unique review URL is a **bearer link**: anyone who has the URL can open and edit that review. Do not share links publicly when assets are confidential. There is no login, role management, password protection, expiration, or reviewer identity/audit trail in this MVP.

Uploads and review JSON are stored in `data/reviews/<review-id>/` on the Node.js server's local filesystem. `data/` is gitignored so uploaded customer files are not committed to GitHub. This does not replace a managed database/object store: confirm that the selected hosting plan preserves writable files across redeploys, maintain backups, and move to persistent external storage before relying on this for important or long-lived client reviews. A deployment or host filesystem reset could lose records and files.

## Known limitations

- Static ZIP checks are heuristic, not platform certification. They do not execute the actual creative in the target ad platform or prove click-through behavior.
- ZIP and HTML previews are best-effort and run inside a sandbox. Some creatives using external dependencies, complex paths, imports, or platform runtime APIs may not render exactly as in an ad server.
- Image/video annotation uses normalized coordinates. Video drawing appears around its saved time; exact frame-perfect review is not guaranteed.
- PDF preview depends on the browser's built-in PDF viewer. Office documents are stored and downloadable but are not rendered inline.
- File processing and video codecs depend on the browser; very large videos are not ideal for browser preview.
- Google Drive integration, local native-agent processing, authentication, permission roles, password-protected links, retention policies, automatic notifications, and external database/object storage are not included yet.

## GitHub build check

GitHub Actions runs `npm install` and `npm run build` on each push to `main` or pull request.
