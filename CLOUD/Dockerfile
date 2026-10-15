# syntax=docker/dockerfile:1.7
# StartCode Cloud — imagen de producción, publicada en Docker Hub.
#   make image            # compila la imagen local con la versión de package.json
#   make push             # amd64 + arm64 a Docker Hub (DOCKERHUB_USER=…)
# Ver README.md y docs/IMAGENES_DOCKER.md.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.4.2

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# ── Build: dependencias completas y compilación ──────────────────────
FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# ── Dependencias de producción ───────────────────────────────────────
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ── Imagen final ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.title="StartCode Cloud" \
      org.opencontainers.image.description="Almacenamiento en la nube de StartCode Panel: archivos de Home y Backups, visor de imagen y video (ffmpeg) y SFTP" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="UNLICENSED"
ENV NODE_ENV=production \
    PORT=3100 \
    CLOUD_DATA_DIR=/data \
    CLOUD_ALLOWED_ROOTS=/storage
WORKDIR /app

# ffmpeg/ffprobe: reproducir cualquier formato de video (re-empaquetar o
# convertir a H.264 al vuelo). Sin ellos solo se ven MP4/H.264 y WebM.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# package.json: /health lee de aquí la versión.
COPY --chown=node:node package.json ./
RUN mkdir -p /data /storage && chown node:node /data /storage

USER node
EXPOSE 3100
VOLUME ["/data", "/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
