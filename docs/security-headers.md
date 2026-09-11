# Security headers per hosting target

The canonical policy lives in [`public/_headers`](../public/_headers), which Vite
copies to `dist/_headers`. Netlify and Cloudflare Pages read that file natively.
For other hosts use the equivalents below — the important part is the
`Content-Security-Policy` and `frame-ancestors 'none'`.

Rationale for the policy: the app self-hosts all scripts, styles and fonts, so
`script-src` and `font-src` are `'self'` and there is no CDN to trust.
`style-src` keeps `'unsafe-inline'` because the startup loader is an inline
`<style>` block that must paint before the bundle loads (inline *scripts* have
been removed, so `script-src 'self'` holds).

## nginx

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://*.maptiler.com; connect-src 'self' https://*.maptiler.com; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header X-Frame-Options "DENY" always;
```

## Apache (.htaccess)

```apache
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://*.maptiler.com; connect-src 'self' https://*.maptiler.com; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(), camera=(), microphone=()"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set X-Frame-Options "DENY"
</IfModule>
```

## Caddy

```caddy
header {
  Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://*.maptiler.com; connect-src 'self' https://*.maptiler.com; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
  X-Content-Type-Options "nosniff"
  Referrer-Policy "strict-origin-when-cross-origin"
  Permissions-Policy "geolocation=(), camera=(), microphone=()"
  Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Cross-Origin-Opener-Policy "same-origin"
  X-Frame-Options "DENY"
}
```

## Amazon S3 + CloudFront

Add the headers through a CloudFront **response headers policy** (attach it to
the distribution's default cache behaviour). S3 alone cannot set response
headers on static objects.

## GitHub Pages

GitHub Pages does **not** support custom response headers. Options:

1. Put Cloudflare in front of the Pages site and apply the policy there
   (recommended; also handles HSTS and caching).
2. Add a meta-tag CSP fallback to each HTML file. It is weaker (no
   `frame-ancestors`, no `report-uri`) but still blocks untrusted scripts:

   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://*.maptiler.com; connect-src 'self' https://*.maptiler.com; object-src 'none'; base-uri 'self'">
   ```

## Verifying

After deploy, confirm the headers and that nothing is blocked:

```bash
curl -sI https://your-host/ | grep -iE 'content-security-policy|x-content-type|referrer-policy|strict-transport'
```

Then load `/`, `/pages/terrain/` and `/pages/dem-inspector/` with the browser
console open: there must be no CSP violations, and the DEM inspector's buttons
must still work (they are wired with `addEventListener`, not inline `onclick`).
