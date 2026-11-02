# Mergentra website

This directory contains the statically generated Angular marketing and
documentation site for Mergentra. It does not run the Electron application in
a browser.

## Local development

```powershell
npm install
npm start
```

Build the static site with:

```powershell
npm run build
```

The deployable files are written to `dist/browser/`.

## Cloudflare Pages

Set the Pages project root directory to `site`, then configure it with:

- **Production branch:** `main`
- **Framework preset:** Angular
- **Build command:** `npm run build`
- **Build output directory:** `dist/browser`

The output directory is relative to the `site` root, so do not prefix it with
`site/`.

After deployment, add `mergentra.ourhh.net` under **Custom domains**.
