// Genera envios/index.json a partir de cada envios/<id>/datos.json aprobado (ya en main).
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const dir = 'envios';
const piezas = [];
for (const ent of await readdir(dir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const base = join(dir, ent.name);
  try {
    const d = JSON.parse(await readFile(join(base, 'datos.json'), 'utf8'));
    let archivo = null;
    for (const nombre of [d.imagen, 'pieza.jpg', 'pieza.png'].filter(Boolean)) {
      try { await access(join(base, nombre)); archivo = nombre; break; } catch {}
    }
    if (!archivo) throw new Error('sin imagen');
    const existe = async (n) => { try { await access(join(base, n)); return true; } catch { return false; } };
    const t = d.tablero || {};
    const lugar = t.ubicacion || t.zona || null;
    const coord = lugar && Number.isFinite(lugar.lat) && Number.isFinite(lugar.lng) ? { lat: lugar.lat, lng: lugar.lng } : {};
    piezas.push({
      id: d.id || ent.name, maquina: d.maquina, titulo: d.titulo, alias: d.alias || '',
      ciudad: d.ciudad || '', fecha: d.fecha || '', imagen: `${base}/${archivo}`,
      mini: (await existe('mini.jpg')) ? `${base}/mini.jpg` : `${base}/${archivo}`,
      grande: (await existe('grande.jpg')) ? `${base}/grande.jpg` : `${base}/${archivo}`,
      ...coord,
    });
  } catch (e) {
    console.warn(`omitido ${base}: ${e.message}`);
  }
}
piezas.sort((a, b) => (b.fecha + b.id).localeCompare(a.fecha + a.id));
await writeFile(join(dir, 'index.json'), JSON.stringify(piezas, null, 2) + '\n');
console.log(`galería: ${piezas.length} piezas`);
