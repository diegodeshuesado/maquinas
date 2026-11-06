/* máquinas_ · Worker de envíos (Cloudflare Workers)
   Recibe una pieza del tablero y la guarda en GitHub como un Pull Request pendiente.
   Merge = aprobada (aparece en la galería). Close = rechazada.

   Variables (Settings → Variables):
     GITHUB_OWNER    tu usuario de GitHub
     GITHUB_REPO     maquinas
     GITHUB_BRANCH   main
     ALLOWED_ORIGIN  https://TU_USUARIO.github.io   (varias, separadas por coma)
   Secretos (Settings → Variables → Encrypt):
     GITHUB_TOKEN     token fine-grained, solo para este repositorio
     TURNSTILE_SECRET clave secreta de Turnstile
*/

const MAQUINAS = ['constelaciones_urbanas', 'un_pueblo_feliz', 'poe_arqui_lecturas', 'anar_quitecturas', 'no_poesia', 'ficciones_de_mi_barrio'];
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const LIMITES = { titulo: 80, narrativa: 3000, ubicacion: 140, alias: 60, ciudad: 60 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const permitidos = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': permitidos.includes(origin) ? origin : (permitidos[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const responder = (datos, status = 200) =>
      new Response(JSON.stringify(datos), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return responder({ error: 'método no permitido' }, 405);
    if (!permitidos.includes(origin)) return responder({ error: 'origen no permitido' }, 403);

    let b;
    try { b = await request.json(); } catch { return responder({ error: 'datos inválidos' }, 400); }

    // trampa para bots: si viene llena, fingimos éxito y no guardamos nada
    if (b.website) return responder({ ok: true });

    // verificación Turnstile
    if (env.TURNSTILE_SECRET) {
      const fd = new FormData();
      fd.append('secret', env.TURNSTILE_SECRET);
      fd.append('response', String(b.turnstile || ''));
      const ip = request.headers.get('CF-Connecting-IP');
      if (ip) fd.append('remoteip', ip);
      const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd })
        .then((r) => r.json()).catch(() => ({ success: false }));
      if (!v.success) return responder({ error: 'la verificación anti-spam falló' }, 403);
    }

    // validación
    if (!MAQUINAS.includes(b.maquina)) return responder({ error: 'máquina desconocida' }, 400);
    if (b.consentimiento !== true) return responder({ error: 'falta el consentimiento' }, 400);
    const campos = {};
    for (const [k, max] of Object.entries(LIMITES)) {
      const val = String(b[k] ?? '').trim();
      if (val.length > max) return responder({ error: `el campo ${k} es demasiado largo` }, 400);
      campos[k] = val;
    }
    if (!campos.titulo || !campos.narrativa) return responder({ error: 'faltan título o narrativa' }, 400);
    const prefijo = 'data:image/png;base64,';
    if (typeof b.png !== 'string' || !b.png.startsWith(prefijo)) return responder({ error: 'falta la imagen' }, 400);
    const pngB64 = b.png.slice(prefijo.length);
    if (pngB64.length * 0.75 > MAX_PNG_BYTES) return responder({ error: 'la imagen es demasiado pesada' }, 413);
    if (!/^[A-Za-z0-9+/]+=*$/.test(pngB64)) return responder({ error: 'imagen inválida' }, 400);

    const fecha = new Date().toISOString();
    const id = `${fecha.slice(0, 10)}_${b.maquina}_${crypto.randomUUID().slice(0, 8)}`;
    const datos = {
      id, maquina: b.maquina, ...campos, fecha: fecha.slice(0, 10), licencia: 'CC BY-NC-SA 4.0',
      tablero: b.tablero && typeof b.tablero === 'object' ? b.tablero : null,
    };

    // GitHub: rama → archivos → Pull Request
    const gh = github(env);
    const base = env.GITHUB_BRANCH || 'main';
    const rama = `envio/${id}`;
    try {
      const ref = await gh('GET', `/git/ref/heads/${base}`);
      await gh('POST', '/git/refs', { ref: `refs/heads/${rama}`, sha: ref.object.sha });
      await gh('PUT', `/contents/envios/${id}/pieza.png`, { message: `envío ${id}: imagen`, content: pngB64, branch: rama });
      await gh('PUT', `/contents/envios/${id}/datos.json`, {
        message: `envío ${id}: datos`, content: base64Utf8(JSON.stringify(datos, null, 2) + '\n'), branch: rama,
      });
      const imgUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/refs/heads/${rama}/envios/${id}/pieza.png`;
      await gh('POST', '/pulls', {
        title: `envío: ${b.maquina} — ${campos.titulo}${campos.alias ? ` (${campos.alias})` : ''}`,
        head: rama, base,
        body: [
          `**máquina:** ${b.maquina}`,
          `**título:** ${campos.titulo}`,
          `**alias:** ${campos.alias || 'anónimo'} · **ciudad:** ${campos.ciudad || '—'}`,
          campos.ubicacion ? `**ubicación:** ${campos.ubicacion}` : '',
          '', '**narrativa:**', '', campos.narrativa.split('\n').map((l) => `> ${l}`).join('\n'),
          '', `![pieza](${imgUrl})`, '',
          '---', 'Consentimiento y licencia CC BY-NC-SA 4.0 aceptados.',
          '**Merge** = aprobar y publicar en la galería · **Close** = rechazar.',
        ].join('\n'),
      });
    } catch (e) {
      console.error(e);
      return responder({ error: 'no se pudo guardar el envío' }, 502);
    }
    return responder({ ok: true, id });
  },
};

function github(env) {
  const raiz = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  return async (metodo, ruta, cuerpo) => {
    const r = await fetch(raiz + ruta, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'maquinas-envios',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (!r.ok) throw new Error(`GitHub ${metodo} ${ruta}: ${r.status} ${await r.text()}`);
    return r.json();
  };
}

function base64Utf8(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
