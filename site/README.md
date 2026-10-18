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

The generated files are written to `dist/`.

## Cloudflare Pages

Configure the Pages project with:

- **Production branch:** `main`
- **Framework preset:** Angular
- **Build command:** `npm --prefix site ci && npm --prefix site run build`
- **Build output directory:** `site/dist`

After deployment, add `mergentra.ourhh.net` under **Custom domains**.
