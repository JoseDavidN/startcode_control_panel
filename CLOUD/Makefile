# StartCode Cloud
RUN = pnpm

GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m

.DEFAULT_GOAL := help
.PHONY: help install dev build test lint prod user image push

# Imagen de Docker Hub: <DOCKERHUB_USER>/startcode-cloud:<versión de package.json>
VERSION := $(shell node -p "require('./package.json').version")
# 0.2.1 → 0.2: apunta siempre al último parche de esa versión menor
MINOR   := $(shell node -p "require('./package.json').version.split('.').slice(0,2).join('.')")
IMAGE   = $(DOCKERHUB_USER)/startcode-cloud
PLATFORMS ?= linux/amd64,linux/arm64

help:
	@echo "$(GREEN)StartCode Cloud $(VERSION) — comandos:$(NC)"
	@echo "  $(YELLOW)make install$(NC)    - Instalar dependencias"
	@echo "  $(YELLOW)make dev$(NC)        - Servidor de desarrollo (watch)"
	@echo "  $(YELLOW)make build$(NC)      - Compilar a dist/"
	@echo "  $(YELLOW)make test$(NC)       - Tests"
	@echo "  $(YELLOW)make lint$(NC)       - ESLint"
	@echo "  $(YELLOW)make prod$(NC)       - Ejecutar lo compilado (dist/)"
	@echo "  $(YELLOW)make user U=…$(NC)   - Crear usuario o cambiar su contraseña"
	@echo "  $(YELLOW)make image$(NC)      - Imagen Docker local (DOCKERHUB_USER=…)"
	@echo "  $(YELLOW)make push$(NC)       - Publicar en Docker Hub: X.Y.Z, X.Y y latest (DOCKERHUB_USER=…)"

install:
	@$(RUN) install

dev:
	@$(RUN) start:dev

build:
	@$(RUN) build

test:
	@$(RUN) test

lint:
	@$(RUN) lint

prod:
	@$(RUN) start:prod

user:
	@test -n "$(U)" || (echo "$(RED)Falta el usuario: make user U=nombre$(NC)"; exit 1)
	@$(RUN) user:add:dev $(U)

# Imagen local para probar (solo la arquitectura de esta máquina)
image:
	@test -n "$(DOCKERHUB_USER)" || (echo "$(RED)Falta DOCKERHUB_USER: make image DOCKERHUB_USER=miusuario$(NC)"; exit 1)
	@echo "$(YELLOW)Compilando $(IMAGE):$(VERSION)...$(NC)"
	docker build --build-arg VERSION=$(VERSION) -t $(IMAGE):$(VERSION) -t $(IMAGE):latest .

# Publicar en Docker Hub (docker login antes), multiplataforma: X.Y.Z, X.Y y latest.
# Una versión publicada no se vuelve a subir: para cambiar algo, versión nueva en package.json.
push:
	@test -n "$(DOCKERHUB_USER)" || (echo "$(RED)Falta DOCKERHUB_USER: make push DOCKERHUB_USER=miusuario$(NC)"; exit 1)
	@if docker buildx imagetools inspect $(IMAGE):$(VERSION) >/dev/null 2>&1; then \
		echo "$(RED)$(IMAGE):$(VERSION) ya está en Docker Hub. Sube la versión en package.json (ver docs/IMAGENES_DOCKER.md).$(NC)"; exit 1; fi
	@echo "$(YELLOW)Publicando $(IMAGE):$(VERSION), :$(MINOR) y :latest ($(PLATFORMS))...$(NC)"
	docker buildx build --platform $(PLATFORMS) --build-arg VERSION=$(VERSION) \
		-t $(IMAGE):$(VERSION) -t $(IMAGE):$(MINOR) -t $(IMAGE):latest --push .
