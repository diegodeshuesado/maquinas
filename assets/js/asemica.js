/* máquinas_ · no_poesía
   Asistente de 4 pasos: poema → escribir sin letras (verso por verso, hoja libre o en papel) → nombrar → revisar y enviar.
   El poema original no aparece en la pieza ni se envía. */
(() => {
  'use strict';

  const M = { id: 'no_poesia', titulo: 'máquina_no_poesía', credito: 'Diego Deshuesado' };
  const LICENCIA = 'CC BY-NC-SA 4.0';
  const CFG = window.MAQUINAS_CONFIG || {};
  const CLAVE = 'maquinas_no_poesia_v1';
  const TOTAL = 4;
  const TINTA = '#141414';
  const RA = 1 / 3;            // alto del renglón en unidades de ancho
  const BASE = 0.62;           // línea guía del renglón (fracción del alto)
  const MAX_VERSOS = 30;
  const PLUMAS = { pluma: 0.0035, plumon: 0.008, pincel: 0.009 };

  const estadoInicial = () => ({
    paso: 1, poema: '', fuera: false, modo: 'verso', herramienta: 'pluma', actual: 0,
    renglones: {}, hoja: [], foto: null, campos: { titulo: '', narrativa: '', alias: '', ciudad: '' },
  });
  let estado = estadoInicial();
  let historial = [];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const aviso = $('#aviso'), mensaje = $('#mensaje');
  const campos = { titulo: $('#f-titulo'), narrativa: $('#f-narrativa'), alias: $('#f-alias'), ciudad: $('#f-ciudad') };
  const lienzo = $('#lienzo');

  // ── foto en papel (IndexedDB) ─────────────────────────────────────────
  const db = (() => {
    let abierta = null;
    const abrir = () => abierta || (abierta = new Promise((ok, mal) => {
      const r = indexedDB.open('maquinas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos');
      r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
    }));
    const usar = async (m, fn) => {
      const d = await abrir();
      return new Promise((ok, mal) => { const t = d.transaction('fotos', m), q = fn(t.objectStore('fotos')); t.oncomplete = () => ok(q && q.result); t.onerror = () => mal(t.error); });
    };
    return {
      poner: (id, v) => usar('readwrite', (s) => s.put(v, id)).catch(() => {}),
      leer: (id) => usar('readonly', (s) => s.get(id)).catch(() => null),
      quitar: (id) => usar('readwrite', (s) => s.delete(id)).catch(() => {}),
    };
  })();
  let fotoSrc = null, fotoImg = null;
  const cargarFoto = () => new Promise((ok) => {
    if (!fotoSrc) { fotoImg = null; return ok(null); }
    const im = new Image(); im.onload = () => { fotoImg = im; ok(im); }; im.onerror = () => ok(null); im.src = fotoSrc;
  });

  function guardar() {
    if (aviso) aviso.textContent = '';
    Object.entries(campos).forEach(([k, el]) => { estado.campos[k] = el.value; });
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { aviso.textContent = 'tu navegador no deja guardar más; tu trabajo sigue aquí mientras no cierres la página.'; }
  }
  async function recuperar() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (d) estado = { ...estado, ...d, campos: { ...estado.campos, ...(d.campos || {}) } };
    } catch {}
    Object.entries(campos).forEach(([k, el]) => { el.value = estado.campos[k] || ''; });
    $('#poema').value = estado.poema || '';
    if (estado.foto) { fotoSrc = await db.leer(estado.foto.id); if (!fotoSrc) estado.foto = null; await cargarFoto(); }
  }

  // ── el poema ──────────────────────────────────────────────────────────
  // líneas con estrofas: '' marca un salto; versos = solo las líneas con texto
  function lineas() {
    const out = [];
    for (const l of (estado.poema || '').split('\n').map((x) => x.trim())) { if (l || (out.length && out[out.length - 1])) out.push(l); }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }
  const versos = () => lineas().filter(Boolean);

  // Wikisource (dominio público)
  const WS = 'https://es.wikisource.org/w/api.php';
  const POETAS = [
    'Sor Juana Inés de la Cruz', 'Rubén Darío', 'Amado Nervo', 'José Martí', 'Gustavo Adolfo Bécquer',
    'Ramón López Velarde', 'Manuel Gutiérrez Nájera', 'José Asunción Silva', 'Julián del Casal', 'Rosalía de Castro',
    'Garcilaso de la Vega', 'Luis de Góngora', 'Francisco de Quevedo', 'Lope de Vega', 'San Juan de la Cruz',
    'Fray Luis de León', 'José de Espronceda', 'José Zorrilla', 'Manuel Acuña', 'Manuel José Othón',
    'Delmira Agustini', 'Julio Herrera y Reissig', 'Gertrudis Gómez de Avellaneda', 'José María Heredia',
    'Jorge Manrique', 'Santa Teresa de Jesús', 'Ricardo Palma', 'Juan de Dios Peza', 'Antonio Plaza', 'Salvador Rueda',
  ];
  const azar = (l) => l[Math.floor(Math.random() * l.length)];
  async function wsPedir(params) {
    const u = new URL(WS);
    Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u.toString()); if (!r.ok) throw new Error(`wikisource ${r.status}`);
    return r.json();
  }
  async function wsBuscar(q) {
    const d = await wsPedir({ action: 'query', list: 'search', srsearch: `${q} insource:poem`, srnamespace: '0', srlimit: '30', srprop: 'size' });
    return ((d.query && d.query.search) || []).filter((r) => r.size > 120 && r.size < 8000).map((r) => r.title);
  }
  const tituloLimpio = (t) => t.split('/').pop().replace(/\s*\([^)]*\)\s*$/, '').trim() || t;
  const decodificar = (t) => { const a = document.createElement('textarea'); a.innerHTML = t; return a.value; };
  function wsVersos(wt) {
    const bloques = [...wt.matchAll(/<poem[^>]*>([\s\S]*?)<\/poem>/gi)].map((m) => m[1]);
    let t = bloques.length ? bloques.join('\n\n') : wt;
    t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '');
    for (let i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
    t = t.replace(/\[\[(?:Archivo|Imagen|Image|File|Categoría|Category):[^\]]*\]\]/gi, '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+ ?([^\]]*)\]/g, '$1')
      .replace(/'{2,}/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/^=+[^=\n]*=+\s*$/gm, '').replace(/^[:;*#]+\s*/gm, '').replace(/__[A-Z]+__/g, '');
    t = decodificar(t);
    const out = [];
    for (const l of t.split('\n').map((x) => x.replace(/\s+/g, ' ').trim())) { if (l || (out.length && out[out.length - 1])) out.push(l); }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }
  async function wsPoema(titulo) {
    const d = await wsPedir({ action: 'parse', page: titulo, prop: 'wikitext', redirects: '1' });
    const v = wsVersos((d.parse && d.parse.wikitext) || '');
    if (v.filter(Boolean).length < 2) throw new Error('sin versos');
    return { titulo: tituloLimpio(titulo), versos: v };
  }
  let abierto = null;
  function abrirPoema(p) {
    abierto = p;
    $('#ws-poema').hidden = false;
    $('#ws-poema-t').textContent = p.titulo;
    const v = $('#ws-versos'); v.innerHTML = '';
    p.versos.forEach((l) => { const d = document.createElement('p'); d.className = l ? 'verso' : 'verso vacio'; d.textContent = l || ' '; v.appendChild(d); });
    $('#ws-poema').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function abrirTitulo(t) {
    $('#ws-estado').textContent = 'abriendo poema_';
    try { abrirPoema(await wsPoema(t)); $('#ws-estado').textContent = ''; }
    catch { $('#ws-estado').textContent = 'no se pudo leer ese poema; prueba con otro.'; }
  }
  const buscar = async () => {
    const q = $('#ws-q').value.trim();
    if (!q) { $('#ws-estado').textContent = 'escribe un poeta o una palabra, o prueba «al azar».'; return; }
    $('#ws-estado').textContent = 'buscando_';
    try {
      const r = await wsBuscar(q), caja = $('#ws-resultados'); caja.innerHTML = '';
      r.slice(0, 20).forEach((t) => { const b = document.createElement('button'); b.className = 'resultado'; b.type = 'button'; b.textContent = tituloLimpio(t); b.addEventListener('click', () => abrirTitulo(t)); caja.appendChild(b); });
      $('#ws-estado').textContent = r.length ? 'toca un poema para leerlo.' : 'sin resultados; prueba otra palabra.';
    } catch { $('#ws-estado').textContent = 'la biblioteca no respondió; revisa tu conexión e intenta de nuevo.'; }
  };
  $('#ws-buscar').addEventListener('click', buscar);
  $('#ws-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
  $('#ws-azar').addEventListener('click', async () => {
    $('#ws-estado').textContent = 'sacando un poema al azar_'; $('#ws-resultados').innerHTML = '';
    for (let i = 0; i < 4; i++) {
      try { const r = await wsBuscar(`"${azar(POETAS)}"`); if (!r.length) continue; abrirPoema(await wsPoema(azar(r))); $('#ws-estado').textContent = '¿otro? toca «al azar» de nuevo.'; return; } catch {}
    }
    $('#ws-estado').textContent = 'la biblioteca no respondió; intenta de nuevo.';
  });
  $('#ws-usar').addEventListener('click', () => {
    if (!abierto) return;
    if (estado.poema.trim() && !confirm('¿reemplazar el poema que ya tienes?')) return;
    usarPoema(abierto.versos.join('\n'));
    $('#poema').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  function usarPoema(txt) {
    estado.poema = txt; estado.fuera = false; estado.renglones = {}; estado.actual = 0;
    $('#poema').value = txt; guardar(); pintarPoema();
  }
  function pintarPoema() {
    const n = versos().length;
    $('#n-versos').textContent = n ? `${n} ${n === 1 ? 'verso' : 'versos'}` : '';
    $('#fuera-ok').hidden = !estado.fuera;
  }
  let tPoema = null;
  $('#poema').addEventListener('input', () => {
    estado.poema = $('#poema').value; if (estado.poema.trim()) estado.fuera = false;
    clearTimeout(tPoema); tPoema = setTimeout(() => {
      const n = versos().length;
      Object.keys(estado.renglones).forEach((k) => { if (Number(k) >= n) delete estado.renglones[k]; });
      estado.actual = Math.min(estado.actual, Math.max(0, n - 1));
      guardar();
    }, 300);
    pintarPoema();
  });
  $('#fuera').addEventListener('click', () => {
    estado.fuera = true; if (estado.modo === 'verso') estado.modo = 'hoja';
    guardar(); pintarPoema(); irA(2);
  });

  // ── escribir sin letras ───────────────────────────────────────────────
  const altoHoja = () => (estado.fuera ? 1.4 : Math.min(3.2, Math.max(1.2, lineas().length * 0.1 + 0.2)));
  const trazosActuales = () => (estado.modo === 'verso' ? (estado.renglones[estado.actual] || (estado.renglones[estado.actual] = [])) : estado.hoja);
  const altoActual = () => (estado.modo === 'verso' ? RA : altoHoja());

  function dibujarTrazo(g, t, W, ox = 0, oy = 0) {
    const p = t.p; if (!p.length) return;
    g.strokeStyle = TINTA; g.fillStyle = TINTA; g.lineCap = 'round'; g.lineJoin = 'round';
    if (p.length === 1) { g.beginPath(); g.arc(ox + p[0][0] * W, oy + p[0][1] * W, (p[0][2] * W) / 2, 0, Math.PI * 2); g.fill(); return; }
    if (t.h !== 'pincel') {
      g.lineWidth = p[0][2] * W; g.beginPath(); g.moveTo(ox + p[0][0] * W, oy + p[0][1] * W);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
        g.quadraticCurveTo(ox + p[i][0] * W, oy + p[i][1] * W, ox + mx * W, oy + my * W);
      }
      const u = p[p.length - 1]; g.lineTo(ox + u[0] * W, oy + u[1] * W); g.stroke(); return;
    }
    for (let i = 1; i < p.length; i++) {
      g.lineWidth = ((p[i - 1][2] + p[i][2]) / 2) * W;
      g.beginPath(); g.moveTo(ox + p[i - 1][0] * W, oy + p[i - 1][1] * W); g.lineTo(ox + p[i][0] * W, oy + p[i][1] * W); g.stroke();
    }
  }
  function pintarLienzo() {
    if (estado.modo === 'papel') return;
    const H = altoActual();
    lienzo.style.aspectRatio = `1 / ${H}`;
    const W = lienzo.clientWidth; if (!W) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(W * dpr); lienzo.height = Math.round(W * H * dpr);
    const g = lienzo.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, W * H);
    g.save(); g.strokeStyle = '#cfcdc6'; g.lineWidth = 1; g.setLineDash([4, 5]);
    const guias = estado.modo === 'verso' ? [BASE * RA] : Array.from({ length: Math.floor((H - 0.06) / 0.1) }, (_, i) => 0.12 + i * 0.1).filter((y) => y < H - 0.03);
    guias.forEach((y) => { g.beginPath(); g.moveTo(10, y * W); g.lineTo(W - 10, y * W); g.stroke(); });
    g.restore();
    trazosActuales().forEach((t) => dibujarTrazo(g, t, W));
  }

  // trazar
  let trazo = null, ultimo = null;
  const punto = (e) => { const r = lienzo.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width]; };
  lienzo.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    historial.push(JSON.stringify({ modo: estado.modo, actual: estado.actual, t: trazosActuales() }));
    if (historial.length > 80) historial.shift();
    const [x, y] = punto(e), h = estado.herramienta;
    trazo = { h, p: [[r4(x), r4(y), PLUMAS[h]]] };
    trazosActuales().push(trazo); ultimo = { x, y, t: e.timeStamp, w: PLUMAS[h] };
    lienzo.setPointerCapture(e.pointerId); pintarLienzo();
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!trazo) return;
    const [x, y] = punto(e), d = Math.hypot(x - ultimo.x, y - ultimo.y);
    if (d < 0.002) return;
    let w = PLUMAS[trazo.h];
    if (trazo.h === 'pincel') {
      const v = d / Math.max(1, e.timeStamp - ultimo.t);              // ancho por milisegundo
      const objetivo = w * Math.min(1.6, Math.max(0.3, 1.6 - v * 900));
      w = ultimo.w * 0.6 + objetivo * 0.4;
    }
    trazo.p.push([r4(x), r4(y), r4(w)]); ultimo = { x, y, t: e.timeStamp, w };
    pintarLienzo();
  });
  const soltar = () => { if (!trazo) return; trazo = null; guardar(); pintarModo(); refrescarMini(); };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  new ResizeObserver(() => { if (estado.paso === 2) pintarLienzo(); }).observe(lienzo);

  $('#deshacer').addEventListener('click', () => {
    const h = historial.pop(); if (!h) return;
    const d = JSON.parse(h);
    if (d.modo === 'verso') estado.renglones[d.actual] = d.t; else estado.hoja = d.t;
    if (d.modo === estado.modo && d.modo === 'verso') estado.actual = d.actual;
    guardar(); pintarModo(); pintarLienzo(); refrescarMini();
  });
  $('#borrar').addEventListener('click', () => {
    if (!trazosActuales().length) return;
    historial.push(JSON.stringify({ modo: estado.modo, actual: estado.actual, t: trazosActuales() }));
    if (estado.modo === 'verso') estado.renglones[estado.actual] = []; else estado.hoja = [];
    guardar(); pintarModo(); pintarLienzo(); refrescarMini();
  });
  $$('[data-pluma]').forEach((b) => b.addEventListener('click', () => { estado.herramienta = b.dataset.pluma; guardar(); pintarModo(); }));
  $$('[data-modo-esc]').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    estado.modo = b.dataset.modoEsc; guardar(); pintarModo(); requestAnimationFrame(pintarLienzo); refrescarMini();
  }));
  $('#verso-ant').addEventListener('click', () => { if (estado.actual > 0) { estado.actual--; guardar(); pintarModo(); pintarLienzo(); } });
  $('#verso-sig').addEventListener('click', () => {
    const n = versos().length;
    if (estado.actual < n - 1) { estado.actual++; guardar(); pintarModo(); pintarLienzo(); }
    else { const f = faltan(); $('#verso-nota').textContent = f.length ? `faltan los versos ${f.join(', ')}.` : 'listo_ escribiste todos los versos. toca «siguiente →».'; }
  });
  const faltan = () => versos().map((_, i) => i).filter((i) => !(estado.renglones[i] || []).length).map((i) => i + 1);

  function pintarModo() {
    const n = versos().length, modo = estado.modo;
    $$('[data-modo-esc]').forEach((b) => b.classList.toggle('on', b.dataset.modoEsc === modo));
    $('[data-modo-esc="verso"]').disabled = estado.fuera || !n;
    $$('[data-pluma]').forEach((b) => b.classList.toggle('on', b.dataset.pluma === estado.herramienta));
    $('#panel-verso').hidden = modo !== 'verso';
    $('#panel-hoja').hidden = modo !== 'hoja';
    $('#panel-papel').hidden = modo !== 'papel';
    $('#panel-trazo').hidden = modo === 'papel';
    $('#borrar').textContent = modo === 'verso' ? 'borrar renglón' : 'borrar hoja';
    if (modo === 'verso' && n) {
      const i = Math.min(estado.actual, n - 1);
      $('#verso-num').textContent = `verso ${i + 1}/${n}`;
      $('#verso-txt').textContent = versos()[i];
      $('#verso-ant').disabled = i === 0;
      $('#verso-sig').textContent = i === n - 1 ? 'terminar_ ✓' : 'siguiente verso_ →';
      const f = faltan();
      $('#verso-nota').textContent = f.length ? `${n - f.length} de ${n} versos escritos.` : 'listo_ escribiste todos los versos.';
    }
    if (modo !== 'verso') $('#verso-nota').textContent = '';
    if (modo === 'hoja') {
      const caja = $('#poema-gris'); caja.hidden = estado.fuera;
      caja.innerHTML = '';
      lineas().forEach((l) => { const p = document.createElement('p'); p.className = l ? 'verso' : 'verso vacio'; p.textContent = l || ' '; caja.appendChild(p); });
    }
    if (modo === 'papel') { $('#papel-vista').hidden = !fotoSrc; if (fotoSrc) $('#papel-vista').src = fotoSrc; }
  }

  // en papel
  function reducir(file, max) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok({ src: c.toDataURL('image/jpeg', 0.9), ar: c.height / c.width });
      };
      im.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen')); };
      im.src = url;
    });
  }
  $$('.entrada-papel').forEach((el) => el.addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const { src, ar } = await reducir(f, 1800);
      if (estado.foto) db.quitar(estado.foto.id);
      const id = uid(); await db.poner(id, src); fotoSrc = src; estado.foto = { id, ar }; await cargarFoto();
      guardar(); pintarModo();
    } catch { aviso.textContent = 'no se pudo leer la foto.'; }
  }));

  // ── la página asémica (sin el poema) ──────────────────────────────────
  function renderPagina(W) {
    let H, dibujar;
    if (estado.modo === 'papel') {
      if (!fotoImg) return null;
      H = Math.round(W * estado.foto.ar);
      dibujar = (g) => g.drawImage(fotoImg, 0, 0, W, H);
    } else if (estado.modo === 'verso') {
      const ls = lineas(), paso = RA * 0.58, salto = paso * 0.6, arriba = RA * 0.3;
      let y = arriba, i = 0; const filas = [];
      for (const l of ls) { if (!l) { y += salto; continue; } filas.push({ i: i++, top: y + paso * 0.8 - BASE * RA }); y += paso; }
      H = Math.round((y + RA * 0.35) * W);
      dibujar = (g) => filas.forEach((f) => (estado.renglones[f.i] || []).forEach((t) => dibujarTrazo(g, t, W, 0, f.top * W)));
    } else {
      const maxY = Math.max(0, ...estado.hoja.flatMap((t) => t.p.map((p) => p[1] + p[2])));
      H = Math.round(Math.max(0.6, Math.min(altoHoja(), maxY + 0.1)) * W);
      dibujar = (g) => estado.hoja.forEach((t) => dibujarTrazo(g, t, W));
    }
    const c = document.createElement('canvas'); c.width = W; c.height = Math.max(1, H);
    const g = c.getContext('2d'); g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, W, H); dibujar(g);
    return c;
  }
  let tMini = null;
  function refrescarMini() {
    clearTimeout(tMini);
    tMini = setTimeout(() => {
      const caja = $('#pagina-mini');
      const hay = estado.modo === 'verso' ? Object.values(estado.renglones).some((t) => t.length) : false;
      caja.hidden = !hay; if (!hay) return;
      const c = renderPagina(600); if (c) $('#pagina-mini img').src = c.toDataURL('image/png');
    }, 250);
  }

  const FUENTE = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
  function envolver(ctx, texto, ancho) {
    const out = [];
    for (const par of String(texto).split(/\n/)) {
      if (!par.trim()) { out.push(''); continue; }
      let a = '';
      for (const p of par.split(/\s+/)) { const t = a ? `${a} ${p}` : p; if (ctx.measureText(t).width > ancho && a) { out.push(a); a = p; } else a = t; }
      out.push(a);
    }
    return out;
  }
  async function componer(S = 2) {
    try { await document.fonts.load('20px "Share Tech Mono"'); } catch {}
    const W = 1400 * S, P = 72 * S, interior = W - P * 2;
    const pag = renderPagina(interior); if (!pag) throw new Error('sin página');
    const v = Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value.trim()]));
    const fecha = new Date().toISOString().slice(0, 10);
    const m = document.createElement('canvas').getContext('2d');
    m.font = `${40 * S}px ${FUENTE}`; const tit = envolver(m, v.titulo || 'sin título', interior);
    m.font = `${24 * S}px ${FUENTE}`; const nota = v.narrativa ? envolver(m, v.narrativa, interior) : [];
    let alto = P + 44 * S + 88 * S + pag.height + 56 * S + tit.length * 50 * S + 20 * S;
    if (nota.length) alto += nota.length * 36 * S + 20 * S;
    alto += 40 * S + 26 * S * 2 + P;
    const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(alto);
    const g = c.getContext('2d'); g.fillStyle = '#f3f2ef'; g.fillRect(0, 0, W, c.height); g.textBaseline = 'top';
    let y = P;
    g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('máquinas_', P, y); y += 44 * S;
    g.font = `${44 * S}px ${FUENTE}`; g.fillStyle = TINTA; g.fillText(M.titulo, P, y); y += 88 * S;
    g.drawImage(pag, P, y); g.lineWidth = 1.5 * S; g.strokeStyle = TINTA; g.strokeRect(P + 0.5, y + 0.5, interior - 1, pag.height - 1);
    y += pag.height + 56 * S;
    g.fillStyle = TINTA; g.font = `${40 * S}px ${FUENTE}`; for (const l of tit) { g.fillText(l, P, y); y += 50 * S; }
    y += 20 * S;
    if (nota.length) { g.font = `${24 * S}px ${FUENTE}`; for (const l of nota) { g.fillText(l, P, y); y += 36 * S; } y += 20 * S; }
    g.fillRect(P, y, interior, 1.5 * S); y += 40 * S;
    g.font = `${20 * S}px ${FUENTE}`; g.fillText([v.alias || 'anónimo', v.ciudad, fecha].filter(Boolean).join(' · '), P, y); y += 26 * S;
    g.fillStyle = '#6f6f6c'; g.fillText(`${LICENCIA} · máquinas_ · ${M.credito}`, P, y);
    return c;
  }

  // ── pasos ─────────────────────────────────────────────────────────────
  function validar(paso) {
    if (paso === 1 && !versos().length && !estado.fuera) return 'elige un poema, pega uno propio o toca «lo tengo en un libro o en papel».';
    if (paso === 2) {
      if (estado.modo === 'verso') {
        const n = versos().length;
        if (n > MAX_VERSOS) return `tu poema tiene ${n} versos; para escribir verso por verso usa hasta ${MAX_VERSOS} (borra algunos en el paso 1 o usa hoja libre).`;
        const f = faltan(); if (f.length) return `faltan los versos ${f.slice(0, 10).join(', ')}${f.length > 10 ? '…' : ''}.`;
      }
      if (estado.modo === 'hoja' && !estado.hoja.length) return 'escribe tu no_poesía en la hoja.';
      if (estado.modo === 'papel' && !fotoSrc) return 'fotografía tu hoja escrita a mano.';
    }
    if (paso === 3 && !campos.titulo.value.trim()) return 'falta el título de tu no_poesía.';
    return null;
  }
  const hayAvance = () => !!(estado.poema.trim() || estado.hoja.length || Object.values(estado.renglones).some((t) => t.length) || estado.foto || estado.campos.titulo);
  function reiniciar(conservar) {
    const { alias, ciudad } = estado.campos;
    if (estado.foto) db.quitar(estado.foto.id);
    fotoSrc = null; fotoImg = null; historial = [];
    estado = estadoInicial();
    if (conservar) Object.assign(estado.campos, { alias, ciudad });
    Object.entries(campos).forEach(([k, el]) => { el.value = estado.campos[k] || ''; });
    $('#poema').value = ''; $('#ws-poema').hidden = true; $('#ws-resultados').innerHTML = ''; $('#vista').removeAttribute('src');
    guardar(); pintarPoema();
  }
  $('#reiniciar').addEventListener('click', () => { if (confirm('¿borrar esta no_poesía y empezar una nueva?')) { reiniciar(true); irA(1); } });
  $('#nueva').addEventListener('click', () => irA(1));

  async function irA(paso) {
    estado.paso = paso;
    $$('.paso').forEach((s) => { s.hidden = Number(s.dataset.paso) !== paso; });
    $('#progreso').textContent = `${'■'.repeat(paso)}${'□'.repeat(TOTAL - paso)} ${paso}/${TOTAL}`;
    $('#reiniciar').hidden = !hayAvance();
    $('#exito').hidden = true; $(`.paso[data-paso="${TOTAL}"]`).classList.remove('enviado');
    $('#formulario').hidden = false; $('.vista').hidden = false;
    $('#anterior').style.visibility = paso > 1 ? 'visible' : 'hidden';
    $('#siguiente').style.display = paso === TOTAL ? 'none' : '';
    aviso.textContent = '';
    if (paso === 1) pintarPoema();
    if (paso === 2) {
      if (estado.modo === 'verso' && (estado.fuera || !versos().length)) estado.modo = 'hoja';
      pintarModo(); requestAnimationFrame(pintarLienzo); refrescarMini();
    }
    if (paso === 3) { const c = renderPagina(900); if (c) $('#vista-nombrar').src = c.toDataURL('image/jpeg', 0.85); }
    if (paso === TOTAL) actualizarVista();
    guardar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#siguiente').addEventListener('click', () => { const e = validar(estado.paso); if (e) { aviso.textContent = e; return; } irA(Math.min(TOTAL, estado.paso + 1)); });
  $('#anterior').addEventListener('click', () => irA(Math.max(1, estado.paso - 1)));
  let tVista = null;
  Object.values(campos).forEach((el) => el.addEventListener('input', () => { guardar(); if (estado.paso === TOTAL) { clearTimeout(tVista); tVista = setTimeout(actualizarVista, 500); } }));
  async function actualizarVista() {
    $('#vista-estado').textContent = 'componiendo pieza_';
    try { $('#vista').src = (await componer(1)).toDataURL('image/jpeg', 0.85); $('#vista-estado').textContent = ''; }
    catch { $('#vista-estado').textContent = 'falta escribir tu no_poesía (paso 2).'; }
  }
  function avisoFinal(t, error = false) { mensaje.textContent = t; mensaje.classList.toggle('error', error); }
  const nombreArchivo = () => `${M.id}_${(campos.titulo.value.trim() || 'pieza').replace(/[^\p{L}\p{N}]+/gu, '_').toLowerCase()}`;
  $('#exportar').addEventListener('click', async () => {
    avisoFinal('componiendo pieza en alta resolución_');
    const a = document.createElement('a'); a.href = (await componer(2)).toDataURL('image/png'); a.download = `${nombreArchivo()}.png`; a.click();
    avisoFinal('png descargado_');
  });

  // ── enviar ────────────────────────────────────────────────────────────
  let widget = null;
  if (CFG.TURNSTILE_SITEKEY) {
    window.onTurnstileLoad = () => { widget = window.turnstile.render('#turnstile', { sitekey: CFG.TURNSTILE_SITEKEY, theme: 'light', language: 'es' }); };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit'; s.async = true; document.head.appendChild(s);
  }
  $('#formulario').addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const p of [1, 2, 3]) { const err = validar(p); if (err) return avisoFinal(err, true); }
    if (!$('#f-consent').checked) return avisoFinal('para enviar, marca la casilla de licencia.', true);
    if (!CFG.WORKER_URL) return avisoFinal('los envíos aún no están activos. puedes descargar tu png.', true);
    let token = '';
    if (CFG.TURNSTILE_SITEKEY) {
      token = window.turnstile && widget !== null ? window.turnstile.getResponse(widget) : '';
      if (!token) return avisoFinal('espera a que termine la verificación de arriba.', true);
    }
    const boton = $('#enviar'); boton.disabled = true;
    const noCerrar = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', noCerrar);
    const anterior = (() => { try { return localStorage.getItem('maquinas_worker_png') === '1'; } catch { return false; } })();
    avisoFinal('1/2 · preparando tu pieza_ no cierres esta página.');
    try {
      const v = Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value.trim()]));
      v.narrativa = v.narrativa || '—';
      const cuerpo = {
        maquina: M.id, ...v, ubicacion: '', licencia: LICENCIA, consentimiento: true,
        website: e.target.website.value, turnstile: token,
        tablero: { modo: estado.modo, versos: estado.modo === 'verso' ? versos().length : null },
      };
      const mandar = (c) => fetch(CFG.WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
      const comoPng = async () => { let png = (await componer(1.5)).toDataURL('image/png'); if (png.length * 0.75 > 7.5e6) png = (await componer(1)).toDataURL('image/png'); return png; };
      let r;
      if (anterior) { const png = await comoPng(); avisoFinal('2/2 · subiendo tu pieza_'); r = await mandar({ ...cuerpo, png }); }
      else { const imagen = (await componer(2)).toDataURL('image/jpeg', 0.9); avisoFinal('2/2 · subiendo tu pieza_ puede tardar un poco con datos móviles.'); r = await mandar({ ...cuerpo, imagen }); }
      let res = await r.json().catch(() => ({}));
      if (!r.ok && res.error === 'falta la imagen' && !anterior) {
        try { localStorage.setItem('maquinas_worker_png', '1'); } catch {}
        avisoFinal('ajustando el formato_ se envía de nuevo en un momento.');
        const png = await comoPng();
        if (CFG.TURNSTILE_SITEKEY && widget !== null && window.turnstile) {
          window.turnstile.reset(widget);
          cuerpo.turnstile = await new Promise((ok) => { const t0 = Date.now(); const i = setInterval(() => { const tk = window.turnstile.getResponse(widget); if (tk || Date.now() - t0 > 20000) { clearInterval(i); ok(tk || ''); } }, 300); });
        }
        r = await mandar({ ...cuerpo, png }); res = await r.json().catch(() => ({}));
      }
      if (!r.ok) throw new Error(res.error || `error ${r.status}`);
      avisoFinal(''); $('#f-consent').checked = false;
      reiniciar(true);
      $('#formulario').hidden = true; $('.vista').hidden = true; $('#exito').hidden = false;
      $(`.paso[data-paso="${TOTAL}"]`).classList.add('enviado'); $('#reiniciar').hidden = true; $('#anterior').style.visibility = 'hidden';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      avisoFinal(`no se pudo enviar: ${ex.message}. tu pieza sigue aquí; intenta de nuevo.`, true);
    } finally {
      window.removeEventListener('beforeunload', noCerrar); boton.disabled = false;
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });

  recuperar().then(() => irA(estado.paso || 1));
})();
