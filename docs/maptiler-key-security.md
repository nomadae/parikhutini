# Keeping the MapTiler key safe

The MapTiler key is a **client-side credential**: the browser must send it on
every tile/style request, so it is always visible in the shipped bundle and in
the network tab. You cannot hide it, and any attempt to do so (base64, obfuscation,
a "secret" JS variable) is security theatre.

The key therefore has to be treated as **public but constrained**, and protected
by four independent layers.

## 1. Restrict the key at MapTiler (the control that actually matters)

In the MapTiler Cloud dashboard, edit the key and set its **allowed origins**
(HTTP referrer restriction) to the exact production origin, e.g.
`https://parhikutini.example.org` and `https://www.parhikutini.example.org`.
Requests with a different or missing `Referer` are rejected by MapTiler, so a
copy of the key lifted out of your bundle cannot be reused from another site.

See MapTiler's own guide:
<https://docs.maptiler.com/guides/maps-apis/maps-platform/how-to-protect-your-map-key/>

Trade-offs to keep in mind:

- Referrer restrictions only work in browsers; they do not stop a scripted
  client that forges the `Referer` header. They raise the bar, they are not a
  guarantee.
- Never create an unrestricted key "just for testing" and then reuse it in
  production.

## 2. Use separate keys per environment and rotate on exposure

- One key for local development (restricted to `http://localhost:5173`), a
  **different** key for production.
- A leak of the dev key then costs nothing and does not require touching
  production.
- **Rotate immediately** whenever a key has been committed, pasted in a chat,
  or otherwise exposed. Rotation — not history rewriting — is what actually
  revokes access, because the old value is already public.

> The key that was committed in this repository's history must be considered
> compromised. Rotate it in the dashboard and delete it. Purging git history
> (`git filter-repo`/BFG) is worthwhile hygiene but is *not* a substitute.

## 3. Never store the key in the repository

- Local: keep it in `.env` only. `.env` is gitignored and should be `chmod 600`.
- CI/deploy: store it as an encrypted secret (GitHub Actions secret, Netlify/
  Cloudflare/Verge env var, etc.) and expose it as the environment variable
  `VITE_MAPTILER_KEY` at build time.
- The value is injected by Vite via `loadEnv` in `vite.config.mjs`; the build
  **fails** for `mode=production` if the variable is missing, so a key can never
  be silently absent from a release.
- `.env.example` documents the variable and contains no value.

## 4. Add automated leak gates

- `.github/workflows/security.yml` runs **gitleaks** on every push and PR so a
  committed key fails the build.
- Enable **GitHub secret scanning + push protection** for the repository
  (Settings → Code security). Push protection blocks the push *before* the
  secret lands in history, which is strictly better than detecting it after.
- Optionally add a local pre-commit hook so the secret never leaves the
  workstation:

  ```bash
  # .git/hooks/pre-commit
  #!/bin/sh
  gitleaks protect --staged --redact
  ```

- Rotate the key immediately if gitleaks or GitHub ever reports a hit.

## 5. Watch usage

Set a usage/spend alert on the MapTiler account so that abuse of a leaked key
is noticed within hours rather than at the end of the month.

## When you genuinely need secrecy

The only way to keep a mapping credential truly hidden is to not give it to the
browser: put a small server-side proxy (or MapTiler Server / self-hosted tiles)
in front, keep the key server-side, and serve tiles from your own origin. That
adds a backend, caching and cost, and is usually not worth it for a public
educational map. For this project, **origin restriction + rotation + leak
gates** is the right level of protection.

## Quick setup for the new key

```bash
# 1. put the new key in .env (never commit it)
cp .env.example .env
$EDITOR .env                     # VITE_MAPTILER_KEY=<new key>
chmod 600 .env

# 2. restrict the new key in the MapTiler dashboard to your production origin

# 3. register it as a CI/deploy secret named VITE_MAPTILER_KEY

# 4. verify the production build refuses to run without it
VITE_MAPTILER_KEY= npm run build   # must fail
npm run build                      # must succeed and bake in the key
```
