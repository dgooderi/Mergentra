# Angular + Cloudflare Pages: Correct Build Output Directory

## Question

This repo's static site lives in `site/` (Angular CLI `^22.2.3`, `@angular/build`
`^22.2.3`, using the `@angular/build:application` builder). `site/angular.json`
sets:

```json
"outputPath": "dist"
```

with no `server` target configured (pure client-side build). Cloudflare Pages
is configured with:

- **Root directory:** `site`
- **Build command:** `npm run build` (runs `ng build`)

Question: what should Cloudflare's **Build output directory** be —
`dist`, `site/dist`, `dist/browser`, or something else? Does Angular 22
change this?

## Findings

### 1. The `application` builder always nests browser output under `browser/`

The authoritative `@angular/build:application` builder schema defines
`outputPath` as either a plain string or an object with `base`, `browser`,
`server`, and `media` sub-properties:

> `"browser": { "type": "string", "pattern": "^[-\\w\\.]*$", "default": "browser", "description": "The output directory name of your browser build within the output path base. Defaults to 'browser'." }`

— `angular/angular-cli:packages/angular/build/src/builders/application/schema.json`
(https://raw.githubusercontent.com/angular/angular-cli/main/packages/angular/build/src/builders/application/schema.json)

This `browser` sub-path defaults to `"browser"` **unconditionally** — it is
not conditional on whether a `server`/SSR target is configured. When
`outputPath` is given as a plain string (as in this repo, `"dist"`), Angular
treats that string as the `base` and still applies the default `browser`
sub-directory, so build artifacts land at `dist/browser/`, not directly in
`dist/`. This was introduced with the Angular 17 `application` builder and
documented in Angular's build-system migration guide
(https://angular.dev/tools/cli/build-system-migration), which describes the
builder unifying browser/server/prerender output in one place. The
`ng build` reference page (https://angular.dev/tools/cli/build) confirms the
default top-level output is `dist/${PROJECT_NAME}` but doesn't itself spell
out the `browser/` nesting — the schema above is the explicit source for that.

No evidence was found that **Angular 22** changes this default relative to
17–21; the `browser`/`server`/`media` schema (with `browser` defaulting to
`"browser"`) is unchanged on the `main` branch used by `@angular/build` 22.x.
The only way to flatten output back to `outputPath` directly is to use the
object form and set `"browser": ""` (available since Angular 17.1+).

### 2. Cloudflare's own Angular framework guide confirms this and tells you to append `/browser`

From Cloudflare's official Angular framework guide
(https://developers.cloudflare.com/pages/framework-guides/deploy-an-angular-site/,
"Create a Pages project" section):

> | Build command | `npm run build` |
> | Build directory | `dist/cloudflare` |
>
> "On some versions of Angular, you may need to:
> Change the `Build command` to `npx ng build --output-path dist/cloudflare`
> Change the `Build directory` to `dist/cloudflare/browser`"

Cloudflare's generic framework-preset table
(https://developers.cloudflare.com/pages/configuration/build-configuration/,
"Framework presets" section) lists a non-version-specific default of
`Angular | npm run build | dist/cloudflare`, but the dedicated Angular guide
above is the more specific, current source and explicitly instructs adding
`/browser` for builds using the newer builder's output layout — exactly
matching this repo's setup.

### 3. Cloudflare's "Root directory" re-bases all other paths

From Cloudflare's build configuration docs
(https://developers.cloudflare.com/pages/configuration/build-configuration/,
"Understanding your build configuration"):

> "The root directory is where your site's content lives. If not specified,
> Cloudflare assumes that your linked git repository is the root directory.
> The root directory needs to be specified in cases like monorepos, where
> there may be multiple projects in one repository."

Cloudflare runs the build command from inside the configured Root directory,
and the Build output directory field is resolved **relative to that same
Root directory**. With Root directory = `site`, Cloudflare looks for output
at `site/<Build output directory>` — so the value entered in Cloudflare must
**not** be prefixed with `site/` (that would resolve to the non-existent
`site/site/dist/browser`).

### 4. Verified against this repo's actual local build output

Running `npm run build` (`ng build`) inside `site/` in this repository
produces:

```
site/dist/
├── 3rdpartylicenses.txt
└── browser/
    ├── index.html
    ├── favicon.ico
    ├── main-*.js
    ├── styles-*.css
    ├── robots.txt
    ├── sitemap.xml
    ├── _headers
    ├── _redirects
    └── assets/
```

`index.html` and all deployable assets are under `dist/browser/`, confirming
the schema-documented behavior above empirically for this exact `angular.json`
configuration (Angular/`@angular/build` `22.2.x`).

## Conclusion

With Root directory = `site`, `outputPath: "dist"`, no SSR/`server` target,
on Angular CLI/`@angular/build` `22.x`:

- **Cloudflare "Build output directory" should be `dist/browser`** (relative
  to the `site` root directory — do not prefix with `site/`).
- Plain `dist` is **incorrect**: it only contains `3rdpartylicenses.txt` and
  the `browser/` folder, not `index.html`, so Cloudflare would fail to find
  a deployable site (or serve nothing usable).
- `site/dist` and `site/dist/browser` are both **incorrect** given Root
  directory is already `site` — the `site/` prefix would be applied twice.
- Angular 22 does **not** change this default; the `browser/` nesting has
  been the `application` builder's behavior since Angular 17 and is
  unchanged through 22.x per the current builder schema.
- Optional alternative (not applied here): set
  `"outputPath": { "base": "dist", "browser": "" }` in `site/angular.json`
  to flatten output back into `dist/` directly, in which case Cloudflare's
  Build output directory could correctly be just `dist`.

## Sources

- https://raw.githubusercontent.com/angular/angular-cli/main/packages/angular/build/src/builders/application/schema.json — authoritative `outputPath`/`browser` sub-option schema and default
- https://angular.dev/tools/cli/build — `ng build` reference, default output directory
- https://angular.dev/tools/cli/build-system-migration — "Migrating to new build system," `application` builder output model
- https://angular.dev/reference/configs/file-structure — workspace/project file structure reference
- https://angular.dev/reference/configs/workspace-config — `angular.json` builder/target configuration reference
- https://developers.cloudflare.com/pages/framework-guides/deploy-an-angular-site/ — Cloudflare's official Angular framework guide (explicit `/browser` instruction)
- https://developers.cloudflare.com/pages/configuration/build-configuration/ — Cloudflare build configuration doc; Root directory semantics and framework presets
- Local verification: `npm run build` executed in `site/` of this repository (Angular/`@angular/build` `22.2.3`), confirming `site/dist/browser/index.html` is the actual build artifact location
- Supplementary (non-primary, corroborating history only): GitHub issues `angular/angular-cli#26028` and `#26356` discussing the `application` builder's `browser/` nesting and the `outputPath.browser: ""` escape hatch added in 17.1
