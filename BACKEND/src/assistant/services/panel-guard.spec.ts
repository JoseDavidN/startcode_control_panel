import { PANEL_PATH_MASK, hidePanelInternals, setPanelInstallDirs, stripPanelInstructions } from './panel-guard';

describe('hidePanelInternals', () => {
  beforeEach(() => setPanelInstallDirs(['/srv/proyectos/startcode_panel/BACKEND', '/srv/proyectos/startcode_panel']));

  it('oculta la ruta del backend y lo que cuelga de ella', () => {
    const out = hidePanelInternals('revisa el archivo .env del backend en /srv/proyectos/startcode_panel/BACKEND/.env o en la sección de conexiones');
    expect(out).not.toContain('/srv/proyectos');
    expect(out).not.toContain('BACKEND/.env');
    expect(out).toContain(PANEL_PATH_MASK);
    expect(out).toContain('en la sección de conexiones');
  });

  it('oculta la ruta del repositorio, con o sin barra final', () => {
    expect(hidePanelInternals('cd /srv/proyectos/startcode_panel/')).toBe(`cd ${PANEL_PATH_MASK}`);
    expect(hidePanelInternals('(en /srv/proyectos/startcode_panel)')).toBe(`(en ${PANEL_PATH_MASK})`);
  });

  it('oculta otras copias del proyecto', () => {
    expect(hidePanelInternals('mira ~/code/startcode-panel/FRONTEND/src/App.tsx')).not.toContain('FRONTEND');
  });

  it('no toca rutas de los servidores del usuario', () => {
    const text = 'Revisa /etc/nginx/sites-enabled/default y /var/www/app/.env, y /srv/proyectos/otro/README.md';
    expect(hidePanelInternals(text)).toBe(text);
  });

  it('no toca /app cuando el panel corre en Docker', () => {
    setPanelInstallDirs(['/app', '/']);
    const text = 'El código está en /app/src/index.js del servidor web';
    expect(hidePanelInternals(text)).toBe(text);
  });
});

describe('stripPanelInstructions', () => {
  beforeEach(() => setPanelInstallDirs(['/srv/proyectos/startcode_panel/BACKEND', '/srv/proyectos/startcode_panel']));

  it('quita párrafos y bloques que apuntan al panel y deja el resto', () => {
    const reply = [
      'Cambia la contraseña en **Bases de Datos**, editando la conexión.',
      'También puedes editar el archivo `.env` en `/srv/proyectos/startcode_panel/BACKEND`:',
      '```bash\nnano /srv/proyectos/startcode_panel/BACKEND/.env\n```',
      'Luego prueba la conexión desde el formulario.',
    ].join('\n\n');
    const out = stripPanelInstructions(reply);
    expect(out).toContain('Bases de Datos');
    expect(out).toContain('prueba la conexión');
    expect(out).not.toContain('.env');
    expect(out).not.toContain('nano');
    expect(out).not.toContain(PANEL_PATH_MASK);
    expect(out).toContain('Se omitieron');
  });

  it('no cambia una respuesta sin rutas del panel', () => {
    const reply = 'Revisa el servicio:\n\n```bash\nsystemctl status nginx\n```';
    expect(stripPanelInstructions(reply)).toBe(reply);
  });
});

