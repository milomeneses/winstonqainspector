# Deploy Winston QA Inspector on Hostinger

This project uses Next.js and needs a Node.js application environment. Availability depends on the Hostinger plan.

## Recommended configuration

- Node.js: 22 LTS, or the newest version supported by your plan
- Application root: the folder containing package.json
- Build command: npm install && npm run build
- Start command: npm run start
- Mode: production
- Port: use the port provided by Hostinger; Next.js reads PORT automatically

## Deploy from GitHub

1. In Hostinger hPanel, open the Node.js web app setup or Add Website flow.
2. Connect https://github.com/milomeneses/winstonqainspector if Git deployment is available in your plan.
3. Set the application root to the repository root.
4. Configure the build and start commands above.
5. Deploy and test the assigned domain.
6. Enable HTTPS before sharing the app.

If the hPanel interface for your plan does not offer a Node.js application, the app will need a compatible Node.js host or a reviewed static-export adaptation.

## MVP limitations

- ZIP files are analyzed in the browser. The client does not send the ZIP contents to the app server.
- JSZip loads the archive into browser memory, so multi-gigabyte packages are not reliably supported.
- Checks are static heuristics: they do not execute the creative, prove click-through behavior, or certify acceptance by an ad platform.
- Google Drive and native local-agent integrations are not implemented yet.
- Before production use, test good and intentionally broken sample packages and verify the size-limit boundary cases.
