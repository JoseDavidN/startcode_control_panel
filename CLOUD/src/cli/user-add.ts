/**
 * Crea o cambia la contraseña de un usuario de la nube.
 *
 *   pnpm user:add <usuario>            (compilado, en producción)
 *   pnpm user:add:dev <usuario>        (desde src, en desarrollo)
 *
 * La contraseña se pide por consola sin mostrarla; para scripts se puede
 * pasar en CLOUD_NEW_PASSWORD. Escribe en `CLOUD_DATA_DIR/users.json`: con
 * la nube en marcha, reiníciala para que lo lea.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { createInterface } from 'readline';
import { hash } from 'bcryptjs';
import { BCRYPT_ROUNDS, USERNAME_RE, type CloudUser } from '@/state/state.store';

function askHidden(question: string): Promise<string> {
  return new Promise(done => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    output._writeToOutput = (s: string) => {
      if (s.startsWith(question)) output.output.write(s);
    };
    rl.question(question, answer => {
      rl.close();
      process.stdout.write('\n');
      done(answer);
    });
  });
}

async function main() {
  loadEnv();
  const username = process.argv[2]?.trim();
  if (!username || !USERNAME_RE.test(username)) {
    console.error('Uso: user:add <usuario>  (letras, números, punto, guion o guion bajo; de 2 a 32)');
    process.exit(1);
  }
  let password = process.env.CLOUD_NEW_PASSWORD ?? '';
  if (!password) {
    password = await askHidden('Contraseña: ');
    const again = await askHidden('Repite la contraseña: ');
    if (password !== again) {
      console.error('Las contraseñas no coinciden.');
      process.exit(1);
    }
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const dataDir = resolve(process.env.CLOUD_DATA_DIR ?? './data');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, 'users.json');
  let users: CloudUser[] = [];
  try {
    users = JSON.parse(await readFile(file, 'utf8')) as CloudUser[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const passwordHash = await hash(password, BCRYPT_ROUNDS);
  users = existing
    ? users.map(u => (u === existing ? { ...u, passwordHash } : u))
    : [...users, { username, passwordHash, createdAt: new Date().toISOString() }];
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  await rename(tmp, file);
  console.log(existing ? `Contraseña de «${existing.username}» actualizada.` : `Usuario «${username}» creado.`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
