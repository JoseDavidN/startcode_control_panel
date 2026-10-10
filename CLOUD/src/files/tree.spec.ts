import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildTree, listFiles } from './tree';

describe('buildTree', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cloud-tree-'));
    await mkdir(join(root, 'Documentos', 'Contratos'), { recursive: true });
    await writeFile(join(root, 'Documentos', 'Propuesta.docx'), 'x'.repeat(10));
    await writeFile(join(root, 'Documentos', 'Contratos', 'ACME.pdf'), 'pdf');
    await writeFile(join(root, 'notas.txt'), 'hola');
    await symlink('/etc', join(root, 'fuera'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('arma el árbol con ids relativos, tipos y tamaños, sin enlaces simbólicos', async () => {
    const tree = await buildTree(root, 'Home', 1000);
    expect(tree).toMatchObject({ kind: 'folder', id: '', name: 'Home' });
    const names = tree.children.map(c => c.name).sort();
    expect(names).toEqual(['Documentos', 'notas.txt']);
    const docs = tree.children.find(c => c.name === 'Documentos');
    expect(docs?.kind).toBe('folder');
    if (docs?.kind !== 'folder') return;
    const proposal = docs.children.find(c => c.name === 'Propuesta.docx');
    expect(proposal).toMatchObject({ kind: 'file', id: 'Documentos/Propuesta.docx', type: 'word', size: 10 });
    const contracts = docs.children.find(c => c.name === 'Contratos');
    expect(contracts).toMatchObject({ id: 'Documentos/Contratos' });
  });

  it('se recorta al llegar al máximo de elementos', async () => {
    const tree = await buildTree(root, 'Home', 1);
    expect(tree.children).toHaveLength(1);
  });

  it('lista los archivos de una carpeta para el zip', async () => {
    const files = await listFiles(join(root, 'Documentos'), 'Documentos');
    expect(files.map(f => f.name).sort()).toEqual(['Documentos/Contratos/ACME.pdf', 'Documentos/Propuesta.docx']);
  });
});
