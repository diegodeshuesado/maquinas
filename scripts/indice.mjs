// Genera envios/index.json a partir de cada envios/<id>/datos.json aprobado (ya en main).
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const dir = 'envios';
const piezas = [];
for (const ent of await readdir(dir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const base = join(dir, ent.name);
  try {
    await access(join(base, 'pieza.png'));
    const d = JSON.parse(await readFile(join(base, 'datos.json'), 'utf8'));
    piezas.push({
      id: d.id || ent.name, maquina: d.maquina, titulo: d.titulo, alias: d.alias || '',
      ciudad: d.ciudad || '', fecha: d.fecha || '', imagen: `${base}/pieza.png`,
    });
  } catch (e) {
    console.warn(`omitido ${base}: ${e.message}`);
  }
}
piezas.sort((a, b) => (b.fecha + b.id).localeCompare(a.fecha + a.id));
await writeFile(join(dir, 'index.json'), JSON.stringify(piezas, null, 2) + '\n');
console.log(`galería: ${piezas.length} piezas`);
