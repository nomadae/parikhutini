# Security Audit — Parhikutini

**Date:** 2026-09-11
**Scope:** Full repository at `master` (`b139452`), pre-deployment review.
**Artifacts reviewed:** `index.html`, `src/**`, `pages/**`, `scripts/**`, `tests/**`, `tools/**`, `vite.config.mjs`, `.env(.example)`, `.github/workflows/build.yml`, `package.json`/lockfile, build output in `dist/`, and git history.
**Method:** Manual source review, secret scanning across working tree + all git blobs/history, dependency audit (`npm audit`), and deployed-artifact inspection.

> **Architecture note:** this is a purely static, client-side SPA. There is no backend, no database, no authentication, no cookies and no user accounts. That eliminates large classes of risk (SQLi, authz/authn bypass, SSRF, session fixation, CSRF). The material risks are **credential exposure**, **supply-chain / third-party script integrity**, **production artifact hygiene**, and **client-side denial of service from untrusted DEM files**.

---

## Executive summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| C1 | **Critical** | MapTiler API key committed to a **public** GitHub repo history — and the same key is still in use | Must fix before deploy |
| H1 | **High** | Production build publishes source maps (`build.sourcemap: true`) | Must fix before deploy |
| H2 | **High** | Third-party CDN JS/CSS loaded without SRI and no CSP | Must fix before deploy |
| M1 | Medium | API key is client-exposed by design; needs origin/referrer restriction | Fix before deploy |
| M2 | Medium | CI workflow targets `main` but default branch is `master` → CI never runs | Fix before deploy |
| M3 | Medium | `dist/` build copies all of `data/` incl. large rasters + raw GIS sources | Fix before deploy |
| M4 | Medium | Untrusted TIFF upload can freeze/crash the browser tab (main-thread DoS) | Fix recommended |
| M5 | Medium | No HTTP security headers (no hosting config in repo) | Fix recommended |
| L1–L12 | Low | `innerHTML` fragility, prototype-key crash in sidebar, debug logging, vendored-lib provenance, unused dep, etc. | Hardening |

The **only finding that requires immediate action before anything is pushed live is C1**: the credential is already public and must be treated as compromised.

---

## Critical

### C1 — MapTiler API key leaked in public git history and still in use

**Evidence.** The API key is present verbatim in the historical root-level `main.js`:

- Commit `2bc03ac` ("initial commit") — `const key = 'uQq…'`
- Commit `3f21708` ("security updates") — same line
- Both blobs are reachable from `HEAD` and from `origin/master`.

The key value currently configured in `.env` (`VITE_MAPTILER_KEY`, fingerprint `uQq…`, 20 chars) **is the same key** that was committed. The current `src/main.js` correctly reads it from `import.meta.env`, but the secret was never removed from history.

The repository is **public** (`github.com/nomadae/parikhutini`, `"visibility": "public"`), so the key is readable by anyone via `git log -p`, the GitHub web UI, or a clone.

**Impact.** Anyone can use the key against `api.maptiler.com`, consuming the project's quota/credit and potentially causing the production site's basemap to fail once the quota is exhausted. It also enables billing abuse if the account has a paid plan. The key is also present in the current working `.env`, so it is a live credential, not a historical one.

**Remediation (in order):**

1. **Rotate the key now** in the MapTiler dashboard and update `.env` / the deploy environment.
2. **Restrict the new key** to the production origin(s) and any dev origins (MapTiler "Allowed origins"/referrer restriction).
3. Optionally purge history (`git filter-repo --path main.js --invert-paths` or BFG) — but this is **not sufficient on its own** (already pushed, cached, and possibly forked/indexed). Rotation is the effective fix; purging is only hygiene.
4. Add a secret-scanning gate (gitleaks/trufflehog) and GitHub push protection so this cannot recur.
5. `chmod 600 .env` (currently `-rw-rw-r--`, group/world-readable).

> Note for the report itself: the full key is deliberately not reproduced here; it is the value currently in `.env`.

---

## High

### H1 — Source maps published in the production build

**Evidence.** `vite.config.mjs:7` sets `build.sourcemap: true`. The built `dist/assets/` contains `.js.map` files for every chunk (e.g. `index-L0ObTjYy.js.map`, `terrain-*.js.map`, `dem-inspector-*.js.map`).

**Impact.**

- Full original source (including comments and any future secrets or internal URLs) is published to anyone who opens DevTools or requests `/.js.map`.
- It makes vulnerability discovery and reverse engineering trivial for an attacker.
- The key itself is not in the map (it is injected post-transform), but it **is** in the shipped bundle `dist/assets/index-*.js`.

**Remediation.** Set `sourcemap: false` for production (or `'hidden'` if you upload maps to an error-tracking service and must not reference them publicly). Keep source maps for local/dev builds only.

### H2 — Third-party CDN assets without SRI or CSP

**Evidence.** `index.html:9-13,237` loads from third-party origins with no `integrity` attribute and the documents define no Content-Security-Policy:

- `https://cdn.jsdelivr.net/npm/ol@v10.10.0/ol.css`
- `https://cdn.jsdelivr.net/npm/bootstrap@5.2.0/dist/css/bootstrap.min.css`
- `https://cdn.jsdelivr.net/npm/bootstrap@5.2.0/dist/js/bootstrap.bundle.min.js` ← executes JS
- `https://fonts.googleapis.com` (Google Fonts)

The Bootstrap script is classic (non-module) and executes with full origin privileges.

**Impact.** A compromise of jsDelivr/npm package/Bootstrap release (or a DNS/TLS interception) yields **arbitrary JavaScript execution on the production origin** — full site takeover, malicious redirects, credential/key theft, supply-chain compromise of every visitor. There is no CSP to limit the blast radius.

**Remediation.**

1. Self-host Bootstrap and `ol.css` (they are already npm-installable) and bundle them through Vite — removes the runtime third-party dependency entirely. This is the strongest fix and also improves offline reliability.
2. If CDN delivery is kept, add Subresource Integrity (`integrity="sha384-…"` + `crossorigin="anonymous"`) to every third-party `<script>`/`<link>`.
3. Add a strict `Content-Security-Policy` (see M5) with an explicit `script-src`/`style-src`/`connect-src` allow-list that includes `https://api.maptiler.com`; avoid `unsafe-inline` (the one inline `<script>` and inline `<style>` in `index.html` should be moved to bundled assets or hashed).
4. Pin integrity-checked versions and prefer `@5.3.x` (see L9).

---

## Medium

### M1 — Client-side API key exposure (by design, but must be constrained)

`src/main.js:16-17` interpolates the key into the MapTiler style URL. Any client-side mapping key is necessarily visible in the bundle; there is no way to hide it. The control that matters is **server-side restriction at MapTiler** (allowed origins/referrers) and **rotation** (C1). Also:

- `key` is not `encodeURIComponent`-ed (low impact for MapTiler keys, but a malformed key silently produces an invalid URL).
- If `VITE_MAPTILER_KEY` is unset, the URL becomes `…?key=undefined` and the failure is silent (`src/main.js:42-45` only logs). Add a build-time check that fails the build when the variable is missing.

### M2 — CI never runs (branch mismatch) and is build-only

**Evidence.** `.github/workflows/build.yml` triggers on `push`/`pull_request` to `main`, but the repository default branch is **`master`** (confirmed via GitHub API). No `main` branch exists, so the workflow effectively never runs.

Additional CI weaknesses:

- The job only runs `npm ci && npm run build` — it does **not** run `npm test` (unit + E2E) or `npm audit`.
- Actions are pinned to mutable major tags (`actions/checkout@v3`, `actions/setup-node@v3`) rather than commit SHAs — a moving-tag supply-chain risk. Bump to `@v4` and consider SHA pinning.

**Remediation.** Change triggers to `master` (or rename the default branch and update everything consistently). Add `npm test` and `npm audit --production` to the job; consider a secret-scanning step.

### M3 — Production copy step ships everything under `data/`

**Evidence.** `scripts/copy-static.mjs` recursively copies the whole `data/` directory into `dist/data`. The current `dist/` is 48 MB and includes:

- `dist/data/mde/` — the large GeoTIFF rasters (~35 MB, intentionally gitignored).
- `dist/data/source/michoacan/` — 13 raw GIS source files (`.shp`, `.dbf`, `.shx`, `.prj`, `.sbn`, `.sbx`, `.cpg`, `.shp.xml`).

**Impact.** If `dist/` is published to a static host/CDN as-is, you publish raw source datasets and multi-megabyte rasters, increasing cost and exposing data you may not have distribution rights for. This is already flagged as an open TODO in `docs/deploy-and-serve-dems.md`.

**Remediation.** In production, copy only the artifacts the site actually needs (`data/all.json`, and only the DEMs you intend to serve, per the chosen hosting strategy). Exclude `data/source/` and unneeded rasters. Add license/provenance checks (`docs/dem-sources.md`) before publishing any raster.

### M4 — Untrusted TIFF input can hang or crash the tab

**Evidence.** `pages/dem-inspector` accepts arbitrary local `.tif` files. `src/tiff/decode.mjs` then:

- Derives buffer lengths directly from attacker-controlled TIFF tags: `new Uint16Array(ifd.data.buffer, ifd.data.byteOffset, width * height)` etc. (`decode.mjs:57-73`). A crafted `width`/`height` can throw `RangeError` (caught) or force large allocations.
- Runs multiple full-raster, main-thread loops: min/max/mean/std (`decode.mjs:89-102`), median copy + sort (`pages/dem-inspector/app.js:168-175`), full-canvas `putImageData` (`app.js:90-111`), slope (`app.js:186-196`) and aspect (`app.js:285-314`) passes.
- The vendored UTIF decoder is unaudited third-party code with a known recursive parse path on crafted JPEG/DNL markers (`return this.parse(...)`), which can overflow the stack.

**Impact.** A malicious or corrupted DEM can freeze the UI (unbounded work on the main thread), exhaust memory, or throw uncaught errors. Because the file is chosen by the local user, this is self-DoS rather than remote exploitation — but it is a realistic robustness/privacy concern if you ever accept files from third parties.

**Remediation.** Impose a hard cap on `width × height` (and thus allocation) before decoding; reject implausible dimensions. Move heavy statistics to a Web Worker and/or chunk the loops with yields. Wrap decode in explicit validation and surface a clear error. Consider sandboxing the decode in a Worker so a crash does not take down the page.

### M5 — No HTTP security headers

There is no hosting configuration in the repo (`netlify.toml`, `vercel.json`, `_headers`, `nginx.conf`, `CNAME` are all absent), so none of the standard headers are set. Recommended for the deploy target:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://api.maptiler.com; connect-src 'self' https://api.maptiler.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
Cross-Origin-Opener-Policy: same-origin
```

`frame-ancestors 'none'` (or `X-Frame-Options: DENY`) prevents clickjacking. `Referrer-Policy` also reduces referrer leakage to Google Fonts / CDNs. Prefer self-hosting fonts and Bootstrap so the CSP can be tightened to `'self'` + MapTiler.

---

## Low / hardening

| # | Location | Observation | Suggested fix |
|---|----------|-------------|---------------|
| L1 | `src/main.js:156-160`, `pages/dem-inspector/app.js:77,149,263,271,329,336,344` | `innerHTML` sinks. Currently **safe**: feature strings are escaped (`escapeHtml`, `main.js:164-172`), other values are numeric or static labels, and `toStringHDMS` is coordinate-derived. But the pattern is fragile — one future unescaped field becomes XSS. | Prefer `textContent`/`createElement`; if templates are kept, funnel every dynamic value through `escapeHtml`. |
| L2 | `src/map/sidebar.js:38-41` | `byMunicipio[props.municipio]` uses attacker-controllable JSON keys on a plain object. A feature with `"municipio":"__proto__"` (or `constructor`) throws (`Object.prototype.push` undefined) or pollutes the prototype chain. Data is same-origin today, so risk is low. | Use `Object.create(null)` or a `Map`, and validate the GeoJSON schema. |
| L3 | `src/main.js:255`, `src/terrain/mesh.js:42`, `src/tiff/vendor/UTIF.js:12` | Debug `console.log` of feature objects / load info left in production code. | Remove or gate behind a debug flag. |
| L4 | `src/main.js:248-260` | `fl[0]` dereferences a possibly-`undefined` result; the subsequent `try/catch` masks the control-flow error (and would swallow unrelated bugs). | Use `const [clickedFeature] = fl ?? []` and drop the broad try/catch. |
| L5 | `src/main.js:179,203` | `evt.originalEvent.target.closest(...)` assumes an `Element`; a non-element event target would throw. | Guard with `target instanceof Element`. |
| L6 | `src/main.js:16-17` | Missing/failed env var is silent (`key=undefined`). | Fail the build (or show an explicit UI error) when `VITE_MAPTILER_KEY` is absent. |
| L7 | `src/tiff/vendor/UTIF.js` | Vendored third-party decoder with **no version, upstream URL, license or modification note** (1812 lines, obfuscated). Cannot tell which release is bundled or whether it has known CVEs. | Record provenance (upstream commit + license) in a header and `THIRD_PARTY_NOTICES`; add a note on how to update. |
| L8 | `package.json:17` | `dotenv` is a production dependency but is **never imported** anywhere in `src/`, `pages/`, `scripts/`, or Vite config (Vite loads `.env` itself). | Remove it; reduces dependency/attack surface and install size. |
| L9 | `index.html:10,237` | Bootstrap `5.2.0` (2022) is CDN-loaded and outdated (current 5.3.x). | Upgrade and self-host (see H2). |
| L10 | `.env` | Value is wrapped in literal quotes (`VITE_MAPTILER_KEY="…"`). dotenv/Vite strips them so it works, but it is inconsistent with `.env.example`. | Drop the quotes for clarity; keep `.env` untracked (it correctly is — `git ls-files` shows only `.env.example`). |
| L11 | `tests/dem-inspector.e2e.mjs:15` | Hard-coded browser path (`/opt/brave.com/...`) and `data/mde/nt/mde_nt.tif` make the E2E suite environment-bound; it will fail in CI. | Make the browser path configurable and skip gracefully when the raster/browser is absent. |
| L12 | `.github/workflows/build.yml` | `node-version: 20` — verify it satisfies Vite 8's engine requirement (Node ≥20.19/22.12) and matches the dev environment. | Pin the supported LTS and keep `engines` in `package.json`. |

---

## Positive observations

- **Small attack surface by architecture:** no backend, no auth, no cookies, no `localStorage`/`sessionStorage`/`indexedDB`, no `postMessage`. No SQL, no server filesystem access.
- **No dangerous dynamic-execution sinks:** no `eval`, `new Function`, or `document.write` anywhere in first-party code.
- **Feature data is escaped** before HTML injection (`escapeHtml` in `src/main.js`), and the sidebar is built with `createElement`/`textContent` rather than string HTML.
- **External links are safe:** every `target="_blank"` carries `rel="noopener"` (E2E links, references).
- **`?mde=` is safely handled:** `resolveInitialDem` (`src/terrain/demCatalog.js:17-22`) resolves the query parameter against a fixed catalog and falls back to the first entry — no path traversal or arbitrary-URL fetch.
- **`.env` is correctly gitignored** and `.env.example` contains no secret. `dist/` and `data/mde/` are also ignored.
- **`npm audit` reports 0 vulnerabilities** across 36 production / 40 dev dependencies (lockfile present; Dependabot is configured for weekly npm updates).
- **No hard-coded HTTP endpoints** in application code; MapTiler is the only remote data dependency.

---

## Pre-deploy checklist (prioritized)

**Blockers**

- [ ] **Rotate the MapTiler key** and update `.env` + the deploy environment (C1).
- [ ] **Restrict the new key** by origin/referrer in MapTiler (C1/M1).
- [ ] Set `build.sourcemap: false` for production (H1) and rebuild.
- [ ] Add SRI to third-party assets **or** self-host Bootstrap/`ol.css` (H2).
- [ ] Add a Content-Security-Policy and the other headers at the host (H2/M5).
- [ ] Fix the CI branch trigger (`main` → `master`) and add tests + `npm audit` (M2).
- [ ] Decide the DEM hosting strategy and stop copying `data/source/` and unneeded rasters into the published build (M3).

**Strongly recommended**

- [ ] Cap TIFF dimensions and move heavy DEM analysis off the main thread (M4).
- [ ] Add a build-time assertion for a missing `VITE_MAPTILER_KEY` (M1/L6).
- [ ] Add secret scanning + GitHub push protection to prevent recurrence (C1).
- [ ] `chmod 600 .env` (C1).

**Hygiene**

- [ ] Replace remaining `innerHTML` sinks with DOM APIs (L1).
- [ ] Use `Object.create(null)`/`Map` for the municipio grouping (L2).
- [ ] Remove debug `console.log`s (L3) and the unused `dotenv` dependency (L8).
- [ ] Document the vendored UTIF provenance (L7) and upgrade Bootstrap (L9).

---

## Remediation log (applied after the audit)

| # | Finding | Status | What changed |
|---|---------|--------|--------------|
| C1 | Leaked MapTiler key | **Action required by owner** | Added a secret-scanning CI gate (`.github/workflows/security.yml` + `.gitleaks.toml`), wrote `docs/maptiler-key-security.md`, and hardened `.env` handling. **The key must still be rotated in the MapTiler dashboard and the new one origin-restricted** — code cannot do that. |
| H1 | Production source maps | **Fixed** | `vite.config.mjs` now sets `sourcemap: mode !== 'production'`; verified 0 `.map` files in `dist/`. |
| H2 | CDN assets without SRI/CSP | **Fixed** | Bootstrap 5.3.8, `ol.css` and Inter/Poppins are bundled and self-hosted; all CDN `<link>`/`<script>`/font links removed; CSP added in `public/_headers`. |
| M1 | Client-exposed key / silent failure | **Fixed (mechanism)** | Key is `encodeURIComponent`-ed; the production build now **fails** when `VITE_MAPTILER_KEY` is missing. Origin restriction documented for the owner. |
| M2 | CI never runs | **Fixed** | Triggers changed to `master`, actions bumped to `v4`, added `npm audit` + unit tests; Dependabot now also tracks `github-actions`. |
| M3 | `dist/` published all of `data/` | **Fixed** | `scripts/copy-static.mjs` never copies `data/source/` and skips `data/mde/` unless `--with-dems`; `npm run build:local` preserves the local workflow. |
| M4 | Untrusted TIFF DoS | **Mitigated** | `src/tiff/decode.mjs` validates dimensions and caps rasters at 25 MP; the inspector surfaces real error messages. Moving analysis to a Web Worker remains open. |
| M5 | No security headers | **Fixed (config)** | `public/_headers` (Netlify/Cloudflare) plus per-host snippets in `docs/security-headers.md`. Must be applied at the host. |
| L1 | `innerHTML` sinks | **Fixed** | Popup, file info, statistics and analysis output are built with DOM APIs; no first-party `innerHTML` remains. |
| L2 | Prototype-key crash in sidebar | **Fixed** | `src/map/sidebar.js` groups with a `Map`. |
| L3 | Debug logging | **Fixed** | Removed `console.log` from `src/main.js` and `src/terrain/mesh.js`. |
| L4/L5 | `fl[0]` + `Element` assumptions | **Fixed** | Optional access and `target instanceof Element` guards. |
| L6 | Missing key guard | **Fixed** | Build-time assertion in `vite.config.mjs`. |
| L8 | Unused `dotenv` dependency | **Fixed** | Removed from `package.json`. |
| L9 | Outdated Bootstrap | **Fixed** | Upgraded 5.2.0 → 5.3.8 and self-hosted. |
| L10/L11 | `.env` quoting / E2E hard-coded paths | **Partially fixed** | `.env` chmod 600 + documented; E2E paths left as-is (environment-specific). |
| L7 | Vendored UTIF provenance | **Open** | Still needs an upstream version/license header and `THIRD_PARTY_NOTICES`. |
| L12 | Node version in CI | **Fixed** | CI now uses Node 22 (matches the local runtime). |

Verification performed after the changes:

- `npm run build` → 0 source maps, no `data/source`/`data/mde` in `dist/`, `dist/_headers` emitted, no CDN references.
- `VITE_MAPTILER_KEY= npm run build` → fails as intended.
- `npm run test:unit` and `npm run test:e2e` → pass.
- Headless-Brave smoke test serving `dist/` **with the real CSP**: 0 CSP violations and 0 exceptions on `/`, `/pages/terrain/` and `/pages/dem-inspector/`; sidebar (66 municipios) and Bootstrap collapse work; inspector buttons are wired.

### Remaining owner actions

1. **Rotate the MapTiler key** and restrict the new one to your production origin.
2. Register `VITE_MAPTILER_KEY` as an encrypted secret in the deploy pipeline.
3. Enable **GitHub secret scanning + push protection** on the repository.
4. Apply the headers at the chosen host (and confirm with `curl -sI`).
5. Optionally purge the historical key from git history (hygiene; rotation is the real fix).

---

*Report generated from a static review of `master` @ `b139452`; no dynamic exploitation or live credential validation was performed, and the leaked credential was intentionally not reproduced in full.*

