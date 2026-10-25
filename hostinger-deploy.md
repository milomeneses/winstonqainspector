# Deploy Winston QA Inspector on Hostinger

This app uses Next.js 15 and Node.js 22. The actual feature set available to you depends on your Hostinger Node.js application plan.

## Build settings

- Framework preset: Next.js
- Branch: `main`
- Node: `22.x`
- Root directory: `./`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Environment variables: none required by the current MVP

## Important: upload persistence

The review API currently stores uploaded binary files and review JSON under `data/reviews/<review-id>/` on the Node.js server filesystem. This supports unique cross-user review links on one persistent application instance, but it is not a substitute for a managed database/object store.

Before using reviews as long-term client records, verify on your exact Hostinger plan that the writable runtime filesystem persists across redeploys/restarts and make backups. A redeploy or host reset may lose stored reviews. If you expect multiple server instances or dependable long-term storage, add S3-compatible object storage plus a database (or a managed backend such as Supabase) and migrate this API to that storage.

## Link access

Each asset has a deep link in the form `/review/<review-id>?asset=<asset-id>`, and there is also a link to the full multi-asset review. A review URL is a bearer link. Anyone with the URL can read and edit its notes, annotations, statuses and QA results. Password gates, role permissions, authentication, expiration and access logs are not implemented.

## Limits

- Each file: 100 MB maximum.
- Combined upload batch: 250 MB maximum.
- HTML5 ZIP QA default size threshold: 149,999 bytes; customize the product default to match a specific platform/spec.
- ZIP and HTML previews are best-effort and sandboxed. Static checks do not certify platform acceptance.
- Current inline formats include common images/GIFs, browser-supported video/audio and PDF; Office documents are stored/downloadable but not rendered inline.

## First smoke test after deployment

1. Create a review with a small JPG and a GIF.
2. Copy the unique review URL and open it in a private window or another browser.
3. Add an asset note and draw an annotation.
4. Reload the link to verify changes persisted.
5. Upload an MP4, add a timestamp note, and check that the timecode seeks playback.
6. Upload a tiny HTML5 ZIP with a root HTML file; run QA and check the preview.
7. Remove a test asset and confirm it disappears for all link viewers.
