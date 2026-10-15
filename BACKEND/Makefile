# Variables
RUN = pnpm

# Colores para output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m

# COmando por defecto
.DEFAULT_GOAL := help

# PHONY indica que los siguientes targets no son archivos reales
.PHONY: help install dev build test add remove image push

# Imagen de Docker Hub: <DOCKERHUB_USER>/startcode-panel-backend:<versión de package.json>
VERSION := $(shell node -p "require('./package.json').version")
# 0.9.1 → 0.9: apunta siempre al último parche de esa versión menor
MINOR   := $(shell node -p "require('./package.json').version.split('.').slice(0,2).join('.')")
IMAGE   = $(DOCKERHUB_USER)/startcode-panel-backend
PLATFORMS ?= linux/amd64,linux/arm64

# Ayuda
help:
	@echo "$(GREEN)Comandos disponibles:$(NC)"
	@echo "  $(YELLOW)make install$(NC)    - Instalar dependencias"
	@echo "  $(YELLOW)make dev$(NC)        - Iniciar servidor de desarrollo"
	@echo "  $(YELLOW)make build$(NC)      - Compilar aplicación"
	@echo "  $(YELLOW)make prod$(NC)     	 - Iniciar servidor"
	@echo "  $(YELLOW)make stop$(NC)       - Detener servidor"
	@echo "  $(YELLOW)make restart$(NC)    - Reiniciar servidor"
	@echo "  $(YELLOW)make add$(NC)        - Agregar servicio"
	@echo "  $(YELLOW)make remove$(NC)     - Eliminar servicio"
	@echo "  $(YELLOW)make image$(NC)      - Imagen Docker local (DOCKERHUB_USER=…)"
	@echo "  $(YELLOW)make push$(NC)       - Publicar en Docker Hub: X.Y.Z, X.Y y latest (DOCKERHUB_USER=…)"
	@echo "  $(YELLOW)make help$(NC)       - Mostrar esta ayuda"

# Iniciar servidor de desarrollo
dev:
	@echo "$(YELLOW)Iniciando servidor de desarrollo...$(NC)"
	@$(RUN) start:dev

# Iniciar servidor de produccion
prod:
	@echo "$(YELLOW)Iniciando servidor...$(NC)"
	@$(RUN) start:prod

# Reiniciar servidor
restart:
	@echo "$(YELLOW)Reiniciando servidor...$(NC)"
	@$(RUN) restart:prod	

# Detener servidor
stop:
	@echo "$(YELLOW)Deteniendo servidor...$(NC)"
	@$(RUN) stop:prod

# Agregar servicio
add:
	@echo "$(YELLOW)Agregando servicio...$(NC)"
	@$(RUN) add:service

# Eliminar servicio
remove:
	@echo "$(YELLOW)Eliminando servicio...$(NC)"
	@$(RUN) remove:service

# Instalar dependencias
install:
	@echo "$(YELLOW)Instalando dependencias...$(NC)"
	@$(RUN) install

# Compilar aplicacion
build:
	@echo "$(YELLOW)Compilando aplicacion...$(NC)"
	@$(RUN) build

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

