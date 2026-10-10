/*
 * Crea en una base vacía las tablas de todas las entidades de TypeORM
 * (las compiladas en dist/). Lo usa generate-schema.sh para producir el
 * esquema inicial de producción; no se ejecuta en el contenedor.
 */
const { join } = require('path');
const { DataSource } = require('typeorm');

const url = process.argv[2];
if (!url) {
  console.error('Uso: node docker/sync-schema.cjs postgres://usuario:clave@host:puerto/base');
  process.exit(1);
}

(async () => {
  /* Recién arrancado, el contenedor de Postgres se reinicia una vez tras initdb. */
  for (let attempt = 1; ; attempt++) {
    const ds = new DataSource({
      type: 'postgres',
      url,
      entities: [join(__dirname, '..', 'dist', '**', '*.entity.js')],
      synchronize: true,
    });
    try {
      await ds.initialize();
      await ds.destroy();
      console.log('Esquema sincronizado');
      return;
    } catch (err) {
      if (attempt >= 30) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
