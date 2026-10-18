# Mergentra static site

This directory contains the static marketing and download site for Mergentra.
It does not run the Electron application in a browser.

## Cloudflare Pages

Create a Cloudflare Pages project connected to this repository with:

- **Production branch:** `main`
- **Build command:** none
- **Output directory:** `site`

After the first deployment, add `mergentra.ourhh.net` under **Custom domains**
in the Pages project. If `ourhh.net` is managed by Cloudflare, the DNS record
and HTTPS certificate can be provisioned from the Pages custom-domain flow.
