# syntax=docker/dockerfile:1
#
# Parhikutini — static site image.
#
# Two stages:
#   build   node:22-alpine, `npm ci` from the lockfile, then the Vite build
#   runtime nginx-unprivileged:1.31-alpine serving the bundle on :8080
#
# The app is 100% static — no server process, no database, no runtime secrets —
# so the runtime stage is just a web server for files. The only secret is
# VITE_MAPTILER_KEY, which Vite bakes into the shipped JavaScript by design
# (vite.config.mjs); it must be origin-restricted in the MapTiler dashboard
# rather than hidden. See docs/maptiler-key-security.md.
#
# Build (the key is required — vite.config.mjs refuses a production build
# without it):
#
#   docker build --build-arg VITE_MAPTILER_KEY=your_key -t parhikutini .
#   docker run --rm -p 8080:8080 parhikutini
#   open http://localhost:8080/
#
# Remember that data/mde/ is gitignored, so a CI-built image only contains the
# DEM rasters if the pipeline fetches them first. See docs/deployment-options.md.

# --------------------------------------------------------------------------- #
# Stage 1 — build the bundle
# --------------------------------------------------------------------------- #
FROM node:22-alpine AS build

WORKDIR /app

# Dependency layer first, so editing source does not invalidate the npm cache.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Vite reads VITE_MAPTILER_KEY from the process environment (loadEnv with an
# empty prefix), which is exactly how .github/workflows/build.yml passes its
# throwaway value, so an ARG is sufficient here.
ARG VITE_MAPTILER_KEY

# WITH_DEMS=1 embeds the ~33 MB of GeoTIFF rasters so the terrain viewer works
# from a single self-contained image (~61 MB total). Set to 0 for a ~28 MB image
# and serve /data/mde/ from object storage instead.
ARG WITH_DEMS=1

RUN set -eux; \
    if [ -z "${VITE_MAPTILER_KEY}" ]; then \
        echo 'ERROR: --build-arg VITE_MAPTILER_KEY=<key> is required.' >&2; \
        echo '       vite.config.mjs rejects a production build without it.' >&2; \
        exit 1; \
    fi; \
    if [ "${WITH_DEMS}" = "1" ]; then \
        if [ ! -d data/mde ]; then \
            echo 'WARNING: WITH_DEMS=1 but data/mde/ is absent (it is gitignored).' >&2; \
            echo '         The image will build, but /data/mde/*.tif will 404.' >&2; \
        fi; \
        npm run build:local; \
    else \
        npm run build; \
    fi

# --------------------------------------------------------------------------- #
# Stage 2 — serve it
# --------------------------------------------------------------------------- #
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime

LABEL org.opencontainers.image.title="parhikutini" \
      org.opencontainers.image.description="Interactive volcano map of Michoacán (static site)" \
      org.opencontainers.image.source="https://github.com/nomadae/parikhutini"

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The unprivileged base image already runs as uid 101 (`nginx`). Port 8080 is
# both that image's default and what most PaaS routers expect.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
