# Artefactos del agente

Esta carpeta la llena el repositorio del agente, no este:

```bash
cd /srv/proyectos/startcode-agent/go-agent
make release            # o: make release DEST=/ruta/al/panel/BACKEND/agent-dist
```

Deja aquí los binarios de `linux-amd64` y `linux-arm64`, el `install.sh`
autocontenido (con la unidad de systemd ya incrustada), el `uninstall.sh` y un
`manifest.json` con la versión y las sumas sha256.

El panel sirve estos archivos al servidor remoto durante la instalación del
agente (`GET /api/v1/agent-releases/...`). Si la carpeta está vacía, el backend
lo avisa al arrancar y la instalación falla diciendo que hay que ejecutar
`make release`.

Nada de esto se versiona: son artefactos de compilación (ver `.gitignore`).
