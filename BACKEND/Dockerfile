# syntax=docker/dockerfile:1.7
# Backend de StartCode Panel — imagen de producción.
#   docker build -t startcode-panel-backend .
# Ver DEPLOY.md para el despliegue completo con docker compose.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.4.2

# ── Base: Node + pnpm (corepack) ─────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ── Herramientas de compilación ──────────────────────────────────────
# ssh2 y cpu-features compilan código nativo al instalarse (pnpm-workspace.yaml
# los permite en allowBuilds). Solo hacen falta aquí, no en la imagen final.
FROM base AS toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# ── Build: dependencias completas y compilación ──────────────────────
FROM toolchain AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# ── Dependencias de producción ───────────────────────────────────────
FROM toolchain AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ── Imagen final ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# package.json: /health lee de aquí la versión del backend.
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public
# Artefactos del agente: se montan como volumen (los publica el repositorio
# del agente y cambian sin reconstruir la imagen).
RUN mkdir -p agent-dist && chown node:node agent-dist

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
