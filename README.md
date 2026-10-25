# Winston QA Inspector

Local-first HTML5 banner ZIP QA inspector built with Next.js, TypeScript, React, and JSZip.

## MVP features
- Inspect ZIP contents and report compressed package size
- Identify likely HTML entry points and common banner dimensions
- Heuristic checks for clickTag patterns, external URLs, and missing local resources
- Export QA results as JSON or CSV
- ZIP analysis runs in the browser; selected files are not uploaded by this MVP

## Run locally

Requirements: Node.js 20+ (Node.js 22 LTS recommended).

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build / deploy

```bash
npm install
npm run build
npm run start
```

See [hostinger-deploy.md](./hostinger-deploy.md) for Hostinger Node.js application settings.

## Important limitations
This is an MVP. Checks are static heuristics: the tool does not execute banner JavaScript, validate actual click-through behavior, or certify platform acceptance. The current browser ZIP reader loads the archive into memory and is not suited to multi-gigabyte packages. Google Drive integration and a native local agent are not included yet.
