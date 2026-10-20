import { mkdtemp, mkdir, rm, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { assertInsideRoot, assertNoSymlinks, assertRootAllowed, nameError, parseRelative } from './path-guard';

describe('path-guard', () => {
  describe('nameError', () => {
    it('acepta nombres normales con tildes y espacios internos', () => {
      expect(nameError('Facturación septiembre.xlsx')).toBeNull();
    });
    it.each(['', ' ', '.', '..', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', ' lead', 'trail '])('rechaza %p', name => {
      expect(nameError(name)).not.toBeNull();
    });
    it.each(['a\nb', 'a\rb', 'a\tb', 'a\x7fb', 'foto\u202egpj.exe', 'x\u2066y'])('rechaza caracteres de control o de dirección %p', name => {
      expect(nameError(name)).not.toBeNull();
    });
    it('rechaza nombres de más de 120 caracteres', () => {
      expect(nameError('a'.repeat(121))).not.toBeNull();
    });
  });

  describe('parseRelative', () => {
    it('la raíz son cero segmentos', () => {
      expect(parseRelative('')).toEqual([]);
      expect(parseRelative(undefined)).toEqual([]);
    });
    it('parte una ruta relativa', () => {
      expect(parseRelative('Documentos/Contratos')).toEqual(['Documentos', 'Contratos']);
    });
    it.each(['/etc/passwd', '../secreto', 'a/../../b', 'a//b', 'a/./b', 'a\\b'])('rechaza %p', rel => {
      expect(() => parseRelative(rel)).toThrow();
    });
  });

  describe('assertNoSymlinks', () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'cloud-guard-'));
      await mkdir(join(root, 'real', 'sub'), { recursive: true });
      await symlink(tmpdir(), join(root, 'escape'));
    });
    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('deja pasar rutas reales y las que aún no existen', async () => {
      await expect(assertNoSymlinks(root, ['real', 'sub'])).resolves.toBeUndefined();
      await expect(assertNoSymlinks(root, ['real', 'nueva', 'archivo.txt'])).resolves.toBeUndefined();
    });
    it('rechaza una ruta que atraviesa un enlace simbólico', async () => {
      await expect(assertNoSymlinks(root, ['escape', 'algo'])).rejects.toThrow();
    });
  });

  describe('assertInsideRoot / assertRootAllowed', () => {
    let base: string;
    beforeEach(async () => {
      base = await mkdtemp(join(tmpdir(), 'cloud-inside-'));
      await mkdir(join(base, 'root', 'real'), { recursive: true });
      await mkdir(join(base, 'otro'), { recursive: true });
      await symlink(join(base, 'otro'), join(base, 'root', 'link'));
      await symlink(join(base, 'otro'), join(base, 'raizenlazada'));
    });
    afterEach(async () => {
      await rm(base, { recursive: true, force: true });
    });

    it('acepta rutas que existen o que se van a crear dentro de la raíz', async () => {
      await expect(assertInsideRoot(join(base, 'root'), join(base, 'root', 'real'))).resolves.toBeUndefined();
      await expect(assertInsideRoot(join(base, 'root'), join(base, 'root', 'real', 'nuevo', 'a.txt'))).resolves.toBeUndefined();
    });
    it('rechaza lo que resuelve fuera de la raíz', async () => {
      await expect(assertInsideRoot(join(base, 'root'), join(base, 'root', 'link'))).rejects.toMatchObject({ status: 403 });
      await expect(assertInsideRoot(join(base, 'root'), join(base, 'root', 'link', 'nuevo.txt'))).rejects.toMatchObject({ status: 403 });
    });
    it('rechaza una raíz de sección que resuelve fuera de las permitidas', async () => {
      await expect(assertRootAllowed(join(base, 'root'), [base])).resolves.toBeUndefined();
      await expect(assertRootAllowed(join(base, 'raizenlazada'), [join(base, 'root')])).rejects.toMatchObject({ status: 403 });
    });
  });
});
