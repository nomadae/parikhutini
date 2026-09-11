# Deployment options and pricing

Evaluation of where to host Parhikutini, with current pricing. Two candidate
directions were on the table: a **DigitalOcean Droplet** and a **container
image**. This document also covers the option that fits the app best — **static
hosting** — because the app turned out not to need a server at all.

All prices were collected from vendor primary sources in **September 2026** and
are per month in USD unless stated. Sources are listed at the end. Vendor
pricing changes; re-check before committing.

Reference artifacts for the container path live in [`Dockerfile`](../Dockerfile),
[`deploy/nginx.conf`](../deploy/nginx.conf) and
[`deploy/security-headers.conf`](../deploy/security-headers.conf).

---

## 1. What we are actually deploying

This matters more than the pricing, because it rules most options in or out.

| Property | Finding |
| --- | --- |
| Runtime | **None.** Vite builds three static HTML entry points (`/`, `/pages/terrain/`, `/pages/dem-inspector/`). No server process, no database, no API, no runtime secrets. |
| Build | Node 22, `npm run build`. Requires `VITE_MAPTILER_KEY`; `vite.config.mjs` **fails** a production build without it. |
| Slim artifact | **3.0 MB** — JS 1.5 MB, CSS 248 KB, fonts 976 KB over 54 files, `data/all.json` 224 KB. |
| Full artifact | **36 MB** — the above plus **33.0 MB / 5 GeoTIFF DEM rasters**. |
| Largest single file | **10.13 MiB** (`data/mde/nt/mde_nt.tif`). |
| DEM provenance | `data/mde/` is **gitignored**. A fresh clone has no rasters, so CI must fetch them or the image must be built where they exist. |
| Relative asset paths | The map layer uses `./data/all.json` (sub-path safe), but the DEM catalog uses **absolute `/data/mde/...`** paths and Vite's `base` is unset (`/`). Sub-path hosting (e.g. a GitHub Pages project site at `/parikhutini/`) is **broken today** without code changes. |

### 1.1 The DEMs dominate everything

`src/terrain/mesh.js` downloads each raster **in full** and decodes it in memory:

```js
const response = await fetch(fileUrl);
const arrayBuffer = await response.arrayBuffer();      // whole file
const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
```

It does **not** use HTTP range requests, so this is not COG-style partial
loading. One terrain view = one whole DEM download.

Measured cold-cache page weights (gzipped where compressible):

| Page | Transferred |
| --- | --- |
| Portal `/` | **0.21 MiB** |
| Terrain, default DEM (Tancítaro, 4.89 MiB) | **5.04 MiB** |
| Terrain, largest DEM (Nevado de Toluca, 10.13 MiB) | **10.28 MiB** |

Egress scenarios, assuming a 7.5 MiB average DEM and a cold cache:

| Scenario | Portal views | Terrain views | **Egress/month** |
| --- | ---: | ---: | ---: |
| Quiet (class project) | 1,000 | 200 | **1.7 GiB** |
| Moderate (portfolio / course) | 10,000 | 2,000 | **17.0 GiB** |
| Busy (press or news spike) | 50,000 | 10,000 | **84.8 GiB** |
| Very busy | 200,000 | 40,000 | **339.2 GiB** |

**The cost consequence is mild.** At these volumes egress is not the deciding
factor for metered hosts. The figures below are the marginal rate *once any
included allowance is exhausted*:

| Rate | Host example | 17 GiB | 85 GiB | 339 GiB |
| --- | --- | ---: | ---: | ---: |
| $0.01/GiB | DO Droplet overage | $0.17 | $0.85 | $3.39 |
| $0.02/GiB | DO App Platform / Spaces | $0.34 | $1.70 | $6.78 |
| $0.05/GiB | Railway | $0.85 | $4.24 | $16.96 |
| $0.09/GiB | AWS (past CloudFront's free 1 TB) | $1.53 | $7.63 | $30.53 |
| $0.12/GiB | GCP / Vercel Pro overage | $2.04 | $10.18 | $40.70 |
| **$0** | Cloudflare, R2, CloudFront's first 1 TB, droplet allowance | $0 | $0 | $0 |

At the scenarios modelled here, **every** one of these rows is effectively $0
except the three metered-GiB hosts, because the included allowances (500 GiB–1 TiB
on a Droplet, 1 TB on CloudFront, 50–100 GB on DO App Platform) already cover
the traffic. Only sustained traffic past those allowances makes egress matter.

So the decision is driven by **fixed monthly cost, the free-tier cliff, and
operational burden** — not by bandwidth.

### 1.2 Two constraints that shape the shortlist

**(a) Security headers.** The project ships `public/_headers` with a strict CSP,
HSTS, `X-Frame-Options: DENY` and `Permissions-Policy`, and
`docs/security-headers.md` treats these as required. **`_headers` is read only by
Netlify and Cloudflare Pages.** Everywhere else the same policy must be set
some other way — and one otherwise-attractive option cannot set it at all
(see §2.3).

**(b) The MapTiler key must be origin-restricted.** The key is baked into the
bundle by design, so `docs/maptiler-key-security.md` requires restricting it in
the MapTiler dashboard to the exact production origin. **Whatever hostname you
deploy to must be registered there**, which is a strong argument for putting the
site on a **stable custom domain** from day one instead of a
`*.pages.dev` / `*.ondigitalocean.app` hostname you may later change.

---

## 2. The options

### 2.1 Static hosting — the natural fit

No server, generous or unlimited egress, free TLS, `_headers` often supported.

| Platform | Free tier | Egress | Max file | Custom headers | Verdict for this app |
| --- | --- | --- | --- | --- | --- |
| **Cloudflare Pages** | 500 builds/mo, 20,000 files | **Free and unlimited** for static assets (both free and paid plans) | **25 MiB** | ✅ `_headers` native | **Best fit.** 10.13 MiB max file clears the 25 MiB cap. Free at every scenario. |
| **Netlify** | **300 credits/mo, hard cap** — site *pauses* | 20 credits/GB ≈ **15 GB max** on free | No hard cap documented for Git/CLI | ✅ `_headers` native | **Risky.** Moderate (17 GiB) already exceeds free; Personal $9/mo ≈ 50 GB. |
| **Vercel** | Hobby: 100 GB/mo | 100 GB, then pause (no overage on Hobby) | 100 MB | ✅ `vercel.json` | Works, but **Hobby is non-commercial only**; Pro is $20/mo. |
| **GitHub Pages** | Free | **100 GB/mo soft limit** | 1 GB site size | ❌ **Not supported** | Only if hosted in a sub-path — which the app does not support yet. CSP would need a weaker `<meta>` fallback. |
| **S3 + CloudFront** | **Always Free**: 1 TB/mo egress + 10M requests (a standing allowance, *not* a 12-month trial) | First 1 TB/mo free, then $0.085/GB (US) | None (S3 objects to 48.8 TiB) | ✅ Response-headers policy (**$0**) | **Strong $0 runner-up.** Most moving parts, and S3 alone cannot set headers. |

Notes:

- **Cloudflare Pages bandwidth is genuinely unlimited for static assets**, not
  merely undocumented: Cloudflare states "On both free and paid plans, requests
  to static assets are free and unlimited. A request is considered static when
  it does not invoke Functions." The three HTML entry points are plain static
  files, so this app never invokes a Function and never touches a request quota.
- **Cloudflare Pages has no separate paid plan.** The free tier is the product;
  the paid path is the Workers Paid plan ($5/mo minimum per account), and static
  asset requests stay free either way.
- **Netlify switched to credit-based pricing** for accounts created on or after
  4 Sep 2025: 300 credits/month is a **hard limit with no overage purchase** —
  when credits run out, every project pauses and visitors see "Site not
  available". Bandwidth costs 20 credits/GB, so the free plan's ceiling is
  ~15 GB of egress. With 33 MB rasters that is a realistic thing to hit. Legacy
  (pre-Sep-2025) accounts keep 100 GB/month.
- **Vercel Hobby prohibits commercial use** ("restricted to non-commercial
  personal use only"; donations don't count as commercial). For a public
  educational map this is probably fine, but it is a policy risk if the project
  ever becomes funded or ad-supported.
- **GitHub Pages** is explicitly "not intended for or allowed to be used as a
  free web-hosting service to run your online business". It also cannot set the
  CSP — only open feature requests exist for header support — and its 1 GB site
  limit forces the 33 MB of rasters somewhere else.
- **S3 + CloudFront is a legitimate $0 option** and the best fallback if you
  want a single origin with no per-file cap. CloudFront's 1 TB/month egress and
  10M requests are an **Always Free** allowance, so even the 339 GiB "very busy"
  scenario costs nothing but the ~$0.001/month of S3 storage; the risk is the
  cliff at 1 TB, past which US egress is $0.085/GB. A **response-headers policy**
  ($0, not a billed dimension) applies the CSP/HSTS/`X-Frame-Options`. CloudFront
  also now offers flat-rate plans (free: 1M requests + 100 GB; Pro $15/mo: 10M
  requests + 50 TB) if a predictable cap is what you want.
- **Netlify's drag-and-drop deploy** warns that files over 10 MB "are likely to
  cause your deploy to get stuck" — our largest is 10.13 MiB. Git/CLI deploys
  avoid that path.

### 2.2 Container platforms

The container artifacts in this repo are verified: nginx syntax passes
`nginx -t`, all three routes return 200, the DEM is served byte-identical with
`image/tiff` and range support, the CSP survives into every `location`, and the
error log stays empty.

Modelled on **0.25 vCPU / 512 MiB, always-on** (730 h), which is far more than
nginx needs for a 36 MB static site:

| Platform | Monthly compute | Scale-to-zero | Egress | **Realistic total** |
| --- | ---: | --- | --- | ---: |
| **Fly.io** `shared-cpu-1x` 256 MB | $2.02 | ✅ auto stop/start | $0.02/GB | **~$2.6** |
| **GCP Cloud Run** | ~$0 net (gross $4.93, offset by free tier) | ✅ default (**recommended**) | 1 GiB free, then $0.12/GiB | **~$0–3.5** |
| **AWS App Runner** | ~$2.61 | ❌ minimum 1 instance always billed | First 100 GB/mo free, then $0.09 | **~$2.6–3.6** |
| **Azure Container Apps** | ~$0.5–4.3 | ✅ default | First 100 GB/mo free, then $0.087 | **~$0–4.3** |
| **DigitalOcean App Platform** | **$5.00** (`apps-s-1vcpu-0.5gb`) | ❌ | 50 GiB included, then $0.02/GiB | **$5.00** |
| **Render** | $7.00 | Paid never spins down | 5 GB incl., then $0.15/GB | **~$10.75** |
| **Railway** | $10.00 usage (Hobby $5 credit) | ✅ serverless | $0.05/GB | **~$11.50** |

Every one of these lets nginx set the CSP, so the security-header requirement is
satisfied. All offer custom domains with managed TLS.

Container-specific costs and gotchas:

- **Registry.** GitHub Container Registry (`ghcr.io`) is **free for public
  images** and currently free for container storage generally — the obvious
  choice. DigitalOcean Container Registry's free Starter tier (500 MiB, 1 repo)
  also fits our ~60 MB image; Basic is $5/mo.
- **Image size.** `WITH_DEMS=1` gives roughly a 60 MB image (25 MB nginx base +
  36 MB site, and GeoTIFFs do not compress). `WITH_DEMS=0` gives ~28 MB but the
  terrain viewer 404s unless you serve `/data/mde/` from object storage.
- **Every content or DEM change rebuilds and repushes the whole image.** For a
  site whose main payload is 33 MB of rarely-changing rasters, that is the main
  tax of containerizing.
- **Fly.io** charges $2/mo for a dedicated IPv4; a shared IPv4 is free.
- **App Runner** has no true scale-to-zero and adds a per-service
  automatic-deployment fee (~$1/mo, unconfirmed on the pricing page).
- **Railway** bills *allocated* resources while idle unless Serverless is
  enabled — cheap-looking configs can cost more than expected.
- **Cloud Run** bills idle CPU/RAM when you pin `min-instances=1`; leave
  `min-instances=0` to actually pay nothing (at the cost of a cold start).

### 2.3 The DigitalOcean App Platform trap

This is the single most important finding for the DO path.

App Platform's **static site** component is free, but the app spec exposes
**only CORS `access-control-*` response headers** — there is no field for an
arbitrary response header. I confirmed this directly against the
[App Spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/):
every `header` occurrence is a CORS option. **The CSP, HSTS, `X-Frame-Options`
and `Permissions-Policy` from `public/_headers` therefore cannot be applied**, and
DO App Platform does not read `_headers` at all.

The **container** component on App Platform has no such problem, because nginx
sets the headers itself — but it starts at **$5.00/mo** and loses the free tier.

### 2.4 DigitalOcean Droplet

A Droplet is the option with the fewest unknowns and the most control, and it is
also the one that asks the most of you.

| Plan | RAM / vCPU / SSD | Included transfer | $/month |
| --- | --- | --- | ---: |
| Basic | 512 MiB / 1 / 10 GiB | 500 GiB | **$4.00** |
| Basic | 1 GiB / 1 / 25 GiB | 1,000 GiB | **$6.00** |
| Basic | 2 GiB / 1 / 50 GiB | 2,000 GiB | **$12.00** |
| Basic | 2 GiB / 2 / 60 GiB | 3,000 GiB | **$18.00** |
| Basic | 4 GiB / 2 / 80 GiB | 4,000 GiB | **$24.00** |

- **Per-second billing**, minimum 60 s, capped at 672 h (28 days) per month.
  **A powered-off Droplet still bills** — destroy it to stop.
- **Overage $0.01/GiB** outbound; inbound free. The cheapest plan's **500 GiB**
  already exceeds even the "very busy" 339 GiB scenario.
- Public IPv4 is included on bundled plans. Snapshots are **opt-in** at
  $0.06/GiB/mo; backups add 20–30% of the Droplet price.

Costs to add on top:

| Item | Cost | Needed? |
| --- | --- | --- |
| Domain name | ~$10–15/year | **Yes** — required for TLS and MapTiler origin restriction. |
| TLS | $0 with Caddy (automatic Let's Encrypt) | Yes, via Caddy. |
| Droplet backups | +20–30% ($1.20 on the $6 plan) | **No** — the site rebuilds from git. Skip it. |
| Spaces for DEMs | $5/mo | **No** — the Droplet's own 1 TiB transfer covers them. |
| Your time | Patching, firewall, TLS renewal, monitoring | The real cost. |

**$4/mo already works** for serving 36 MB of static files. I'd suggest **$6/mo**
if you intend to run the npm build *on the box* (512 MiB is tight for
`npm ci` + Vite), or keep the $4 plan and build in CI, then `rsync` the
`dist/` output.

Two configuration choices worth knowing:

- **You do not need Docker on a Droplet for this app.** `Caddy` (or nginx)
  serving `dist/` directly is simpler, auto-renews TLS, and avoids a registry
  and image rebuilds. Docker on a Droplet only pays off if you want the exact
  same artifact running locally and on the server.
- If you do run the container on the Droplet, `deploy/nginx.conf` terminates
  HTTP on 8080; put Caddy in front for TLS. The `Strict-Transport-Security`
  header is only meaningful once TLS is terminated.

---

## 3. Side-by-side

Assuming the **moderate** scenario (17 GiB/month) and a custom domain you
already own:

| Option | Fixed | Egress | **Total/mo** | Headers | Ops burden |
| --- | ---: | ---: | ---: | --- | --- |
| **Cloudflare Pages** | $0 | $0 | **$0** | ✅ native | **Minimal** |
| **Vercel Hobby** | $0 | $0 | **$0** | ✅ | Minimal (non-commercial only) |
| **S3 + CloudFront** | ~$0 | $0 *(inside free 1 TB)* | **~$0** | ✅ policy | Medium |
| **GitHub Pages** | $0 | $0 | **$0** | ❌ | Minimal (sub-path unsupported) |
| **Cloud Run** (container, scale-to-zero) | ~$0 | $1.92 | **~$1.9** | ✅ nginx | Low |
| **Fly.io** (container, 256 MB) | $2.02 | $0.34 | **~$2.4** | ✅ nginx | Low |
| **DO Droplet** $4 plan | $4.00 | $0 *(inside 500 GiB)* | **$4.00** | ✅ nginx/Caddy | **High** |
| **DO Droplet** $6 plan | $6.00 | $0 *(inside 1 TiB)* | **$6.00** | ✅ nginx/Caddy | **High** |
| **DO App Platform** (container) | $5.00 | $0 *(inside 50 GiB)* | **$5.00** | ✅ nginx | Low |
| **DO App Platform** (static) | $0 | $0.32 | **~$0.3** | ❌ **CSP impossible** | Minimal |
| **Render** | $7.00 | $1.80 | **~$8.8** | ✅ nginx | Low |
| **Railway** | $10.00 | $0.85 | **~$11** | ✅ nginx | Low |
| **Netlify** Personal | $9.00 | $0 *(inside 1,000 credits)* | **$9.00** | ✅ native | Minimal |

Egress line: Cloud Run 16 GiB over the free 1 GiB at $0.12; Fly 17 × $0.02;
Render 12 GiB over the included 5 GB at $0.15; Railway 17 × $0.05; DO App
Platform static 16 GiB over the free 1 GiB at $0.02.

At the **busy** scenario (85 GiB) the ranking barely moves. Netlify free and
Vercel Hobby blow their ceilings and pause; Cloud Run/GCP egress grows to ~$10;
Render to ~$19; Railway to ~$14. Cloudflare Pages, **S3 + CloudFront** (still
inside the free 1 TB) and the Droplet (500 GiB–1 TiB included) all stay flat at
$0–6.

---

## 4. Recommendation

**Primary: Cloudflare Pages, on a custom domain.**

It is the only option that is free at every traffic level modelled, has no
egress cliff, reads the project's existing `_headers` file natively, and clears
the 25 MiB per-file limit with room to spare (largest raster: 10.13 MiB).

**Important: do not use Cloudflare's Git integration for this app.** Pages
builds from the repository, and `data/mde/` is gitignored — so a Git build
produces a `dist/` with no rasters and the terrain viewer 404s on every DEM.
Choose one:

1. **Direct upload (recommended).** Build locally where the rasters exist and
   push the finished directory:
   ```bash
   VITE_MAPTILER_KEY=... npm run build:local
   npx wrangler pages deploy dist --project-name parhikutini
   ```
   This ships the 36 MB artifact including rasters, and each file is well under
   the 25 MiB cap.
2. **Commit the rasters** (~33 MB) so the Git build can see them. Simplest, but
   it reverses a deliberate `.gitignore` decision and bloats every clone.
3. **Serve the rasters from R2** and drop `WITH_DEMS`, which also removes the
   33 MB from the Pages deployment entirely — at the cost of the CORS and
   `connect-src` work described below.

Option 1 keeps the current repo layout and costs nothing.

Caveat to watch: the 25 MiB **per-file** ceiling (the 33 MB is spread over five
files, so today's largest — 10.13 MiB — fits with room to spare). If a future
DEM exceeds it, move the rasters to **R2** ($0.015/GB-month, 10 GB free, **zero
egress fees**) behind a custom domain. Two things to remember if you do:

1. R2 does **not** parse `_headers`. Apply CSP/`nosniff` to the raster origin
   with a zone-level Response Header Transform Rule, and verify it actually
   fires on R2 custom-domain responses — otherwise use a one-line Worker.
2. A cross-origin raster host needs CORS on the bucket **and** that origin added
   to `connect-src` in `public/_headers`, exactly as
   `docs/deploy-and-serve-dems.md` already warns.

Serving the rasters from the same origin avoids both problems, which is one
argument for the container routes below.

**If you want the container image anyway — yes, it is worth building, but run it
on Cloud Run or Fly.io, not on DO.** The container itself is a fine idea: it
gives an identical artifact everywhere, trivial rollback by image tag, and no
host OS to patch. It just does not need to run on a Droplet. Cloud Run with
`min-instances=0` costs roughly nothing when idle; Fly.io is about $2.4/mo.

**On the DigitalOcean Droplet specifically:** it is entirely workable and cheap
($4–6/mo), and the 500 GiB–1 TiB included transfer means bandwidth will never be
your problem. But for a static site you are buying a server to patch, secure,
monitor and back up — for a workload that a CDN does better and for free. I'd
only choose it if you want the box for other reasons (a fixed IP, SSH access,
scheduled Python data-pipeline runs, or learning server administration). If you
do, use **Caddy rather than Docker** and skip backups, since the site is
reproducible from git.

**Avoid:** DigitalOcean App Platform's *static site* tier (cannot set the CSP —
it silently fails the project's own security requirement), GitHub Pages (no
custom headers, and sub-path hosting is broken without code changes), and
Netlify's free tier for this app (the 33 MB rasters make the ~15 GB credit
ceiling a realistic risk, and exceeding it takes the site offline).

---

## 5. Deployment checklist (applies to any host)

1. **Rotate the MapTiler key** if the currently committed-then-deleted key is
   still live (`docs/maptiler-key-security.md`).
2. **Restrict the key's allowed origins** to the production hostname in the
   MapTiler dashboard. Do this *after* choosing the domain — a later domain
   change means revisiting this step.
3. Provide `VITE_MAPTILER_KEY` as a build-time secret (`VITE_MAPTILER_KEY`).
   The build fails without it — by design.
4. **Make the DEM rasters available to the build.** They are gitignored, so
   either build where `data/mde/` exists, or fetch them from object storage in
   the pipeline. Use `npm run build:local` to include them, `npm run build` to
   omit them. On a Git-integrated host this is the step that silently breaks the
   terrain viewer — see §4.
5. **Verify the security headers after deploy:**
   ```bash
   curl -sI https://your-domain/ | grep -iE 'content-security-policy|x-content-type|referrer-policy|strict-transport'
   ```
   Then load `/`, `/pages/terrain/` and `/pages/dem-inspector/` with the console
   open — there must be no CSP violations.
6. **Register the new origin in MapTiler** and re-test the basemap, or you will
   get a grey map with 403s.
7. Keep cache headers: hashed `/assets/*` immutable; `/data/mde/*` long-lived
   (they are not content-hashed); HTML revalidated.

---

## 6. What is in this repo now

| File | Purpose |
| --- | --- |
| `Dockerfile` | Two-stage build: `node:22-alpine` → `nginxinc/nginx-unprivileged:1.31-alpine`, serving on `:8080`. Build args `VITE_MAPTILER_KEY` (required) and `WITH_DEMS` (default `1`). |
| `deploy/nginx.conf` | Caching, gzip, `image/tiff` for rasters, `_headers` denied, `server_tokens off`. |
| `deploy/security-headers.conf` | The `public/_headers` policy for nginx, in one include so it survives nginx's non-inheriting `add_header`. |
| `.dockerignore` | Keeps `.env`, `data/source/` and authoring material out of the image while keeping `data/mde/` and `data/all.json`. |

Both container paths were verified locally: `nginx -t` passes; `/`,
`/pages/terrain/` and `/pages/dem-inspector/` return 200; `/data/mde/nt/mde_nt.tif`
is served byte-identical (sha256 match) as `image/tiff` with range support; the
CSP is present on HTML **and** on `/assets/*` (the `add_header` inheritance
trap); gzip works; `/_headers` returns 404; the error log is empty.

`docker build` itself was **not** run here (no Docker or Podman in this
environment), so treat the Dockerfile as reviewed-but-unbuilt and let CI be the
first real build.

---

## Sources

**DigitalOcean** — [Droplet pricing](https://www.digitalocean.com/pricing/droplets) ·
[Droplet pricing docs](https://docs.digitalocean.com/products/droplets/details/pricing/) ·
[App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) ·
[App Spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/) ·
[Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/) ·
[Container Registry pricing](https://docs.digitalocean.com/products/container-registry/details/pricing/) ·
[Snapshots](https://docs.digitalocean.com/products/snapshots/details/pricing/) ·
[Backups](https://docs.digitalocean.com/products/backups/details/pricing/) ·
[Bandwidth billing](https://docs.digitalocean.com/platform/billing/bandwidth/)

**Cloudflare** — [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) ·
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) ·
[Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)

**Netlify** — [Pricing](https://www.netlify.com/pricing/) ·
[Credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) ·
[How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) ·
[Custom headers](https://docs.netlify.com/manage/routing/headers/) ·
[HTTPS](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/)

**Vercel** — [Limits](https://vercel.com/docs/limits) ·
[Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) ·
[Pro plan](https://vercel.com/docs/plans/pro-plan) ·
[vercel.json headers](https://vercel.com/docs/project-configuration/vercel-json#headers)

**GitHub** — [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

**AWS** — [CloudFront pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/) ·
[S3 pricing](https://aws.amazon.com/s3/pricing/) ·
[CloudFront response headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-response-headers.html)

**Containers** — [Cloud Run pricing](https://cloud.google.com/run/pricing) ·
[Fly.io pricing](https://fly.io/docs/about/pricing/) ·
[Render pricing](https://render.com/pricing) ·
[Railway pricing](https://docs.railway.com/pricing/plans) ·
[App Runner pricing](https://aws.amazon.com/apprunner/pricing/) ·
[Azure Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/) ·
[GHCR billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
