# Variables
RUN = pnpm run

# Colores para output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m

# COmando por defecto
.DEFAULT_GOAL := help

# PHONY indica que los siguientes targets no son archivos reales
.PHONY: install dev build test add remove

# Ayuda
	@echo "$(GREEN)Comandos disponibles:$(NC)"
	@echo "  $(YELLOW)make install$(NC)    - Instalar dependencias"
	@echo "  $(YELLOW)make dev$(NC)        - Iniciar servidor de desarrollo"
	@echo "  $(YELLOW)make build$(NC)      - Compilar aplicación"
	@echo "  $(YELLOW)make prod$(NC)     	 - Iniciar servidor"
	@echo "  $(YELLOW)make stop$(NC)       - Detener servidor"
	@echo "  $(YELLOW)make restart$(NC)    - Reiniciar servidor"
	@echo "  $(YELLOW)make add$(NC)        - Agregar servicio"
	@echo "  $(YELLOW)make remove$(NC)     - Eliminar servicio"
	@echo "  $(YELLOW)make help$(NC)       - Mostrar esta ayuda"

# Iniciar servidor de desarrollo
dev:
	@echo "$(YELLOW)Iniciando servidor de desarrollo...$(NC)"
	@$(RUN) dev

# Iniciar servidor de produccion
prod:
	@echo "$(YELLOW)Iniciando servidor...$(NC)"
	@$(RUN) build

# Reiniciar servidor
restart:
	@echo "$(YELLOW)Reiniciando servidor...$(NC)"
	@$(RUN) build	

# Detener servidor
stop:
	@echo "$(YELLOW)Deteniendo servidor...$(NC)"
	@$(RUN) build

# Agregar servicio
add:
	@echo "$(YELLOW)Agregando servicio...$(NC)"
	@$(RUN) build

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

