/* máquinas_ · anar_quitecturas
   Asistente de 5 pasos: imagen base → intervenir (trazo, texto, stickers) → nombrar → ubicar (opcional) → revisar y enviar.
   Todo ocurre en el navegador; nada sale hasta que la persona envía. */
(() => {
  'use strict';

  // ── configuración ─────────────────────────────────────────────────────
  const M = { id: 'anar_quitecturas', titulo: 'máquina_anar_quitecturas', credito: 'Diego Deshuesado' };
  const LICENCIA = 'CC BY-NC-SA 4.0';
  const CFG = window.MAQUINAS_CONFIG || {};
  const CLAVE = 'maquinas_anar_quitecturas_v1';
  const TOTAL = 5;
  const COLORES = [['#141414', 'negro'], ['#ffffff', 'blanco'], ['#b3261e', 'rojo'], ['#e3a83a', 'ámbar']];
  const GROSORES = { fino: 0.006, medio: 0.013, grueso: 0.026 };
  const LETRAS = {
    plumon: { nombre: 'plumón', familia: '"Permanent Marker", cursive' },
    grafiti: { nombre: 'grafiti', familia: '"Sedgwick Ave Display", cursive' },
    estencil: { nombre: 'esténcil', familia: '"Stardos Stencil", sans-serif', peso: '700' },
    fanzine: { nombre: 'fanzine', familia: '"Special Elite", monospace' },
    recorte: { nombre: 'recorte', familia: null },
  };
  const RECORTE_FAMILIAS = ['"Permanent Marker", cursive', '"Special Elite", monospace', '"Stardos Stencil", sans-serif', '"Sedgwick Ave Display", cursive', '"Share Tech Mono", monospace'];
  const RECORTE_FONDOS = [['#ffffff', '#141414'], ['#141414', '#f3f2ef'], ['#e3a83a', '#141414'], ['#b3261e', '#ffffff'], ['#f3f2ef', '#141414']];
  const REFERENTES = [
    ['monumento', 'monumento a la Revolución'], ['ángel', 'Ángel de la Independencia'],
    ['palacio', 'Palacio Nacional México'], ['congreso', 'Palacio Legislativo de San Lázaro'],
    ['corte', 'Suprema Corte de Justicia de la Nación edificio'], ['catedral', 'Catedral Metropolitana de la Ciudad de México'],
    ['escudo', 'Escudo Nacional Mexicano'], ['estatua', 'estatua ecuestre bronce'], ['billete', 'billete Banco de México'],
  ];
  // mapa (paso 4), igual que en las otras máquinas
  const CLAVE_MAPA = String(CFG.MAPA_KEY || '').trim();
  const TESELAS = CFG.MAPA_TESELAS || (CLAVE_MAPA
    ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png?key=${CLAVE_MAPA}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  const GRISES = !CLAVE_MAPA && !CFG.MAPA_TESELAS;
  const ATRIB = CLAVE_MAPA ? '© OpenStreetMap © CARTO' : '© OpenStreetMap';
  const INICIO = { lat: 20.5931, lng: -100.3923, zoom: 15 };

  // ── estado ────────────────────────────────────────────────────────────
  // capa: trazo { id, tipo, color, grosor, pincel, puntos:[[x,y]] } · texto { id, tipo, texto, letra, color, x, y, tam, rot }
  //       sticker { id, tipo, ar, x, y, ancho, rot }   (x, y = centro en fracción de la imagen; tamaños en fracción del ancho)
  const estadoInicial = () => ({
    paso: 1, base: null, capas: [], ubicacion: null, sinUbicacion: false,
    actual: { color: '#141414', grosor: 'medio', pincel: 'plumon', letra: 'grafiti' },
    campos: { titulo: '', narrativa: '', alias: '', ciudad: '' },
  });
  let estado = estadoInicial();
  let historial = [];
  let modo = 'mover';
  let elegido = null;
  const imagenes = new Map(); // id → HTMLImageElement (base y stickers)

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const redondear = (n) => Math.round(n * 1000) / 1000;
  const aviso = $('#aviso'), mensaje = $('#mensaje');
  const campos = { titulo: $('#f-titulo'), narrativa: $('#f-narrativa'), alias: $('#f-alias'), ciudad: $('#f-ciudad') };
  const lienzo = $('#lienzo'), base = $('#base'), trazos = $('#trazos'), capasEl = $('#capas');

  // ── guardar / recuperar (imágenes en IndexedDB) ───────────────────────
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
  const fuentesDe = new Map(); // id → dataURL (no va a localStorage)
  function guardar() {
    if (aviso) aviso.textContent = '';
    Object.entries(campos).forEach(([k, el]) => { estado.campos[k] = el.value; });
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch {}
  }
  async function recuperar() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (d) estado = { ...estado, ...d, actual: { ...estado.actual, ...(d.actual || {}) }, campos: { ...estado.campos, ...(d.campos || {}) } };
    } catch {}
    Object.entries(campos).forEach(([k, el]) => { el.value = estado.campos[k] || ''; });
    const ids = [estado.base && estado.base.id, ...estado.capas.filter((c) => c.tipo === 'sticker').map((c) => c.id)].filter(Boolean);
    for (const id of ids) { const src = await db.leer(id); if (src) fuentesDe.set(id, src); }
    if (estado.base && !fuentesDe.has(estado.base.id)) estado.base = null;
    estado.capas = estado.capas.filter((c) => c.tipo !== 'sticker' || fuentesDe.has(c.id));
    await cargarImagenes();
  }
  function cargarImagen(id) {
    const src = fuentesDe.get(id);
    if (!src) return Promise.resolve(null);
    let im = imagenes.get(id);
    if (im && im.src === src && im.complete) return Promise.resolve(im);
    im = new Image(); im.src = src; imagenes.set(id, im);
    return new Promise((ok) => { im.onload = () => ok(im); im.onerror = () => ok(null); });
  }
  const cargarImagenes = () => Promise.all([...fuentesDe.keys()].map(cargarImagen));

  // ── imagen base (paso 1) ──────────────────────────────────────────────
  function reducirArchivo(file, max, png) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok({ src: png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9), ar: c.height / c.width });
      };
      im.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen')); };
      im.src = url;
    });
  }
  async function ponerBase(src, ar, credito) {
    if (estado.base) { db.quitar(estado.base.id); fuentesDe.delete(estado.base.id); }
    const id = uid();
    fuentesDe.set(id, src); await db.poner(id, src); await cargarImagen(id);
    estado.base = { id, ar, credito: credito || null };
    estado.capas = []; historial = [];
    guardar(); mostrarBase();
  }
  function mostrarBase() {
    const caja = $('#base-elegida');
    if (!estado.base) { caja.hidden = true; return; }
    caja.hidden = false;
    $('#base-vista').src = fuentesDe.get(estado.base.id);
    $('#base-credito').textContent = estado.base.credito ? `imagen libre · ${estado.base.credito.autor} · ${estado.base.credito.licencia}` : '';
  }
  $$('.entrada-base').forEach((e) => e.addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try { const { src, ar } = await reducirArchivo(f, 1800, false); await ponerBase(src, ar, null); }
    catch { aviso.textContent = 'no se pudo leer la imagen.'; }
  }));

  // Wikimedia Commons: imágenes libres (piden crédito al autor)
  const COMMONS = 'https://commons.wikimedia.org/w/api.php';
  const sinHtml = (t) => { const d = document.createElement('div'); d.innerHTML = t || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
  async function commonsBuscar(q, limite = 18) {
    const u = new URL(COMMONS);
    Object.entries({
      action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
      gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limite),
      prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '1280',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u.toString()); if (!r.ok) throw new Error('commons');
    const d = await r.json();
    return ((d.query && d.query.pages) || []).map((p) => {
      const ii = p.imageinfo && p.imageinfo[0]; if (!ii || !/jpeg|png/.test(ii.mime || '')) return null;
      const md = ii.extmetadata || {};
      return {
        titulo: p.title, url: ii.thumburl || ii.url, pagina: ii.descriptionurl,
        autor: sinHtml(md.Artist && md.Artist.value).slice(0, 80) || 'autor desconocido',
        licencia: sinHtml(md.LicenseShortName && md.LicenseShortName.value) || 'licencia libre',
      };
    }).filter(Boolean);
  }
  async function usarCommons(r) {
    $('#base-estado').textContent = 'descargando imagen_';
    try {
      const blob = await (await fetch(r.url)).blob();
      const { src, ar } = await reducirArchivo(blob, 1800, false);
      await ponerBase(src, ar, { autor: r.autor, licencia: r.licencia, pagina: r.pagina });
      $('#base-estado').textContent = '';
    } catch { $('#base-estado').textContent = 'no se pudo descargar esa imagen; prueba con otra.'; }
  }
  function miniaturas(caja, lista) {
    caja.innerHTML = '';
    lista.forEach((r) => {
      const b = document.createElement('button'); b.className = 'mini-libre'; b.type = 'button';
      const im = document.createElement('img'); im.src = r.url.replace(/\/\d+px-/, '/330px-'); im.alt = r.etiqueta || r.titulo; im.loading = 'lazy';
      b.appendChild(im);
      if (r.etiqueta) { const s = document.createElement('span'); s.textContent = r.etiqueta; b.appendChild(s); }
      b.addEventListener('click', () => usarCommons(r));
      caja.appendChild(b);
    });
  }
  let carruselListo = false;
  async function cargarCarrusel() {
    if (carruselListo) return; carruselListo = true;
    const caja = $('#carrusel');
    const res = await Promise.all(REFERENTES.map(async ([etiqueta, q]) => {
      try { const r = await commonsBuscar(q, 4); const elegido = r[Math.floor(Math.random() * Math.min(r.length, 4))]; return elegido && { ...elegido, etiqueta }; }
      catch { return null; }
    }));
    const ok = res.filter(Boolean);
    if (ok.length) miniaturas(caja, ok); else { caja.textContent = 'los referentes no cargaron; usa el buscador o tu galería.'; carruselListo = false; }
  }
  const buscarLibres = async () => {
    const q = $('#libre-q').value.trim(); if (!q) return;
    $('#base-estado').textContent = 'buscando_';
    try {
      const r = await commonsBuscar(q);
      miniaturas($('#libres'), r);
      $('#base-estado').textContent = r.length ? 'toca una imagen para usarla.' : 'sin resultados; prueba otra palabra.';
    } catch { $('#base-estado').textContent = 'la búsqueda no respondió; revisa tu conexión.'; }
  };
  $('#libre-buscar').addEventListener('click', buscarLibres);
  $('#libre-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarLibres(); } });

  // ── editor (paso 2) ───────────────────────────────────────────────────
  const tamLienzo = () => ({ W: lienzo.clientWidth, H: lienzo.clientHeight });
  const rnd = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const semilla = (id, i) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) * 31 + i * 7;
  function recorteLetra(id, i) {
    const s = semilla(id, i);
    const [fondo, tinta] = RECORTE_FONDOS[Math.floor(rnd(s) * RECORTE_FONDOS.length)];
    return { familia: RECORTE_FAMILIAS[Math.floor(rnd(s + 1) * RECORTE_FAMILIAS.length)], fondo, tinta, rot: (rnd(s + 2) - 0.5) * 12, escala: 0.85 + rnd(s + 3) * 0.35 };
  }
  function empujarHistorial() { historial.push(JSON.stringify(estado.capas)); if (historial.length > 60) historial.shift(); }

  function pintarEditor() {
    if (!estado.base) return;
    lienzo.style.aspectRatio = `1 / ${estado.base.ar}`;
    base.src = fuentesDe.get(estado.base.id);
    const { W, H } = tamLienzo();
    if (!W) return;
    // trazos
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    trazos.width = Math.round(W * dpr); trazos.height = Math.round(H * dpr);
    const g = trazos.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    estado.capas.filter((c) => c.tipo === 'trazo').forEach((c) => dibujarTrazo(g, c, W, H));
    // objetos
    capasEl.innerHTML = '';
    estado.capas.forEach((c) => {
      if (c.tipo === 'trazo') return;
      const el = document.createElement('div');
      el.className = `obj ${c.tipo}` + (elegido === c.id ? ' elegido' : '');
      el.dataset.id = c.id;
      el.style.left = `${c.x * 100}%`; el.style.top = `${c.y * 100}%`;
      el.style.transform = `translate(-50%, -50%) rotate(${c.rot || 0}deg)`;
      if (c.tipo === 'texto') {
        const px = c.tam * W;
        if (c.letra === 'recorte') {
          [...c.texto].forEach((ch, i) => {
            const r = recorteLetra(c.id, i), s = document.createElement('span');
            s.textContent = ch === ' ' ? '\u00a0' : ch;
            if (ch !== ' ') Object.assign(s.style, { fontFamily: r.familia, background: r.fondo, color: r.tinta, transform: `rotate(${r.rot}deg)`, fontSize: `${px * r.escala}px` });
            else s.style.fontSize = `${px * 0.6}px`;
            el.appendChild(s);
          });
        } else {
          const L = LETRAS[c.letra] || LETRAS.grafiti;
          Object.assign(el.style, { fontFamily: L.familia, fontWeight: L.peso || '400', fontSize: `${px}px`, color: c.color });
          el.textContent = c.texto;
        }
      } else {
        const im = document.createElement('img'); im.src = fuentesDe.get(c.id); im.alt = 'sticker'; im.draggable = false;
        im.style.width = `${c.ancho * W}px`;
        el.appendChild(im);
      }
      capasEl.appendChild(el);
    });
    $('#vacio-editor').hidden = estado.capas.length > 0;
    pintarControles();
  }
  function dibujarTrazo(g, c, W, H, k = 1) {
    if (c.puntos.length < 1) return;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = c.color; g.fillStyle = c.color;
    const ancho = GROSORES[c.grosor] * W;
    g.lineWidth = ancho;
    if (c.pincel === 'aerosol') { g.shadowColor = c.color; g.shadowBlur = ancho * 1.6 * k; g.globalAlpha = 0.85; }
    g.beginPath();
    const [x0, y0] = c.puntos[0]; g.moveTo(x0 * W, y0 * H);
    if (c.puntos.length === 1) { g.arc(x0 * W, y0 * H, ancho / 2, 0, Math.PI * 2); g.fill(); g.restore(); return; }
    for (let i = 1; i < c.puntos.length - 1; i++) {
      const [x1, y1] = c.puntos[i], [x2, y2] = c.puntos[i + 1];
      g.quadraticCurveTo(x1 * W, y1 * H, ((x1 + x2) / 2) * W, ((y1 + y2) / 2) * H);
    }
    const [xl, yl] = c.puntos[c.puntos.length - 1]; g.lineTo(xl * W, yl * H);
    g.stroke(); g.restore();
  }

  // controles: colores, grosor, pincel, letra y ajustes del objeto elegido
  $('#colores').innerHTML = COLORES.map(([c, n]) => `<button class="muestra" type="button" data-color="${c}" style="background:${c}" aria-label="${n}" title="${n}"></button>`).join('');
  $('#letras').innerHTML = Object.entries(LETRAS).map(([k, L]) => k === 'recorte'
    ? `<button class="herr chica" type="button" data-letra="recorte"><span class="muestra-recorte">r<b>e</b>c<i>o</i>rte</span></button>`
    : `<button class="herr chica" type="button" data-letra="${k}" style="font-family:${L.familia};font-weight:${L.peso || 400}">${L.nombre}</button>`).join('');
  const capaElegida = () => estado.capas.find((c) => c.id === elegido);
  function pintarControles() {
    const a = estado.actual, c = capaElegida();
    const color = c && c.tipo === 'texto' ? c.color : a.color, letra = c && c.tipo === 'texto' ? c.letra : a.letra;
    $$('[data-color]').forEach((b) => b.classList.toggle('sel', b.dataset.color === color));
    $$('[data-grosor]').forEach((b) => b.classList.toggle('on', b.dataset.grosor === a.grosor));
    $$('[data-pincel]').forEach((b) => b.classList.toggle('on', b.dataset.pincel === a.pincel));
    $$('[data-letra]').forEach((b) => b.classList.toggle('on', b.dataset.letra === letra));
    $$('[data-modo]').forEach((b) => b.classList.toggle('on', b.dataset.modo === modo));
    $('#ajustes').hidden = !c;
    $('#fila-grosor').hidden = $('#fila-grosor2').hidden = modo !== 'trazo';
    $('#fila-letra').hidden = !(modo === 'texto' || (c && c.tipo === 'texto'));
    $('#panel-texto').hidden = modo !== 'texto';
    if (c) {
      $('#ajuste-tam').value = String(Math.round((c.tipo === 'texto' ? c.tam / 0.2 : c.ancho / 1) * 100));
      $('#ajuste-giro').value = String(Math.round(c.rot || 0));
    }
    lienzo.classList.toggle('modo-trazo', modo === 'trazo');
    $('#ayuda-editor').textContent = {
      trazo: 'trazo_ dibuja con el dedo o el mouse sobre la imagen.',
      texto: 'texto_ escribe tu frase y toca «agregar». luego arrástrala a donde quieras.',
      mover: c ? 'ajusta el tamaño y el giro abajo, o arrastra para mover.' : 'mover_ toca un texto o sticker para moverlo, escalarlo o girarlo.',
    }[modo] || '';
  }
  function cambiarModo(m) { modo = m; if (m !== 'mover') elegido = null; pintarEditor(); if (m === 'texto') $('#texto-nuevo').focus(); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo],[data-color],[data-grosor],[data-pincel],[data-letra]');
    if (!b || !b.closest('#editor')) return;
    if (b.dataset.modo) return cambiarModo(b.dataset.modo);
    const c = capaElegida();
    if (b.dataset.color) { estado.actual.color = b.dataset.color; if (c && c.tipo === 'texto') { empujarHistorial(); c.color = b.dataset.color; } }
    if (b.dataset.grosor) estado.actual.grosor = b.dataset.grosor;
    if (b.dataset.pincel) estado.actual.pincel = b.dataset.pincel;
    if (b.dataset.letra) { estado.actual.letra = b.dataset.letra; if (c && c.tipo === 'texto') { empujarHistorial(); c.letra = b.dataset.letra; } }
    guardar(); pintarEditor();
  });
  $('#agregar-texto').addEventListener('click', () => {
    const t = $('#texto-nuevo').value.trim(); if (!t) return;
    empujarHistorial();
    const id = uid();
    estado.capas.push({ id, tipo: 'texto', texto: t.slice(0, 80), letra: estado.actual.letra, color: estado.actual.color, x: 0.5, y: 0.5, tam: 0.08, rot: 0 });
    $('#texto-nuevo').value = ''; elegido = id; modo = 'mover'; guardar(); pintarEditor();
  });
  $('#texto-nuevo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#agregar-texto').click(); } });
  $('#sticker').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const { src, ar } = await reducirArchivo(f, 900, f.type === 'image/png' || f.type === 'image/webp');
      empujarHistorial();
      const id = uid(); fuentesDe.set(id, src); await db.poner(id, src); await cargarImagen(id);
      estado.capas.push({ id, tipo: 'sticker', ar, x: 0.5, y: 0.5, ancho: 0.32, rot: 0 });
      elegido = id; modo = 'mover'; guardar(); pintarEditor();
    } catch { aviso.textContent = 'no se pudo leer el sticker.'; }
  });
  $('#ajuste-tam').addEventListener('input', (e) => {
    const c = capaElegida(); if (!c) return;
    const v = Number(e.target.value) / 100;
    if (c.tipo === 'texto') c.tam = Math.max(0.02, v * 0.2); else c.ancho = Math.max(0.05, v);
    pintarEditor();
  });
  $('#ajuste-giro').addEventListener('input', (e) => { const c = capaElegida(); if (!c) return; c.rot = Number(e.target.value); pintarEditor(); });
  ['#ajuste-tam', '#ajuste-giro'].forEach((s) => {
    $(s).addEventListener('pointerdown', () => empujarHistorial());
    $(s).addEventListener('change', () => guardar());
  });
  $('#al-frente').addEventListener('click', () => {
    const c = capaElegida(); if (!c) return; empujarHistorial();
    estado.capas = estado.capas.filter((x) => x !== c).concat(c); guardar(); pintarEditor();
  });
  $('#eliminar').addEventListener('click', () => {
    const c = capaElegida(); if (!c) return; empujarHistorial();
    estado.capas = estado.capas.filter((x) => x !== c);
    if (c.tipo === 'sticker') { db.quitar(c.id); }
    elegido = null; guardar(); pintarEditor();
  });
  $('#deshacer').addEventListener('click', () => {
    if (!historial.length) return;
    estado.capas = JSON.parse(historial.pop()); elegido = null; guardar(); pintarEditor();
  });
  $('#borrar-todo').addEventListener('click', () => {
    if (!estado.capas.length || !confirm('¿borrar toda la intervención?')) return;
    empujarHistorial(); estado.capas = []; elegido = null; guardar(); pintarEditor();
  });

  // dibujar y mover
  let accion = null;
  const punto = (e) => { const r = lienzo.getBoundingClientRect(); return [Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1)]; };
  lienzo.addEventListener('pointerdown', (e) => {
    if (!estado.base) return;
    if (modo === 'trazo') {
      e.preventDefault(); empujarHistorial();
      const a = estado.actual, c = { id: uid(), tipo: 'trazo', color: a.color, grosor: a.grosor, pincel: a.pincel, puntos: [punto(e)] };
      estado.capas.push(c); accion = { trazo: c };
      lienzo.setPointerCapture(e.pointerId); pintarEditor(); return;
    }
    const el = e.target.closest('.obj');
    if (!el) { if (elegido) { elegido = null; pintarEditor(); } return; }
    e.preventDefault();
    const c = estado.capas.find((x) => x.id === el.dataset.id); if (!c) return;
    if (elegido !== c.id) { elegido = c.id; pintarControles(); $$('.obj', capasEl).forEach((o) => o.classList.toggle('elegido', o === el)); }
    const [px, py] = punto(e);
    empujarHistorial();
    accion = { mover: c, el, dx: px - c.x, dy: py - c.y, movio: false };
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!accion) return;
    if (accion.trazo) {
      const p = punto(e), u = accion.trazo.puntos[accion.trazo.puntos.length - 1];
      if (Math.hypot(p[0] - u[0], p[1] - u[1]) > 0.003) { accion.trazo.puntos.push(p); pintarEditor(); }
      return;
    }
    const [px, py] = punto(e), c = accion.mover;
    c.x = Math.min(Math.max(px - accion.dx, 0), 1); c.y = Math.min(Math.max(py - accion.dy, 0), 1);
    accion.el.style.left = `${c.x * 100}%`; accion.el.style.top = `${c.y * 100}%`; accion.movio = true;
  });
  const soltar = () => {
    if (!accion) return;
    if (accion.mover && !accion.movio) historial.pop();
    if (accion.trazo) accion.trazo.puntos = accion.trazo.puntos.map(([x, y]) => [redondear(x * 10) / 10, redondear(y * 10) / 10]);
    accion = null; guardar();
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  new ResizeObserver(() => { if (estado.paso === 2) pintarEditor(); }).observe(lienzo);

  // ── render de la intervención en un lienzo ────────────────────────────
  const FUENTE = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
  async function cargarFuentes() {
    const lista = ['20px "Share Tech Mono"', '20px "Permanent Marker"', '20px "Sedgwick Ave Display"', '700 20px "Stardos Stencil"', '20px "Special Elite"'];
    try { await Promise.all(lista.map((f) => document.fonts.load(f))); } catch {}
  }
  async function renderIntervencion(W) {
    await cargarFuentes(); await cargarImagenes();
    const H = Math.round(W * estado.base.ar);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const b = imagenes.get(estado.base.id);
    if (b) g.drawImage(b, 0, 0, W, H);
    const k = W / Math.max(1, tamLienzo().W || W);
    estado.capas.filter((x) => x.tipo === 'trazo').forEach((x) => dibujarTrazo(g, x, W, H, k));
    for (const x of estado.capas) {
      if (x.tipo === 'trazo') continue;
      g.save(); g.translate(x.x * W, x.y * H); g.rotate(((x.rot || 0) * Math.PI) / 180);
      if (x.tipo === 'sticker') {
        const im = imagenes.get(x.id), w = x.ancho * W, h = w * x.ar;
        if (im) g.drawImage(im, -w / 2, -h / 2, w, h);
      } else if (x.letra === 'recorte') {
        const px = x.tam * W, letras = [...x.texto].map((ch, i) => ({ ch, ...recorteLetra(x.id, i) }));
        const pad = px * 0.08, gap = px * 0.04;
        const anchos = letras.map((l) => { if (l.ch === ' ') return px * 0.35; g.font = `${px * l.escala}px ${l.familia}`; return g.measureText(l.ch).width + pad * 2; });
        let cx = -(anchos.reduce((a, b2) => a + b2, 0) + gap * (letras.length - 1)) / 2;
        letras.forEach((l, i) => {
          const w = anchos[i];
          if (l.ch !== ' ') {
            const fs = px * l.escala;
            g.save(); g.translate(cx + w / 2, 0); g.rotate((l.rot * Math.PI) / 180);
            g.fillStyle = l.fondo; g.fillRect(-w / 2, -fs * 0.62, w, fs * 1.24);
            g.font = `${fs}px ${l.familia}`; g.fillStyle = l.tinta; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(l.ch, 0, fs * 0.04); g.restore();
          }
          cx += w + gap;
        });
      } else {
        const L = LETRAS[x.letra] || LETRAS.grafiti;
        g.font = `${L.peso || 400} ${x.tam * W}px ${L.familia}`;
        g.fillStyle = x.color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(x.texto, 0, 0);
      }
      g.restore();
    }
    return c;
  }

  function envolver(ctx, texto, ancho) {
    const out = [];
    for (const parrafo of String(texto).split(/\n/)) {
      if (!parrafo.trim()) { out.push(''); continue; }
      let actual = '';
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (ctx.measureText(prueba).width > ancho && actual) { out.push(actual); actual = palabra; } else actual = prueba;
      }
      out.push(actual);
    }
    return out;
  }
  const ubicacionTexto = () => (estado.ubicacion ? `${estado.ubicacion.lat.toFixed(3)}, ${estado.ubicacion.lng.toFixed(3)}` : '');

  async function componer(S = 2) {
    const W = 1400 * S, P = 72 * S, interior = W - P * 2;
    const img = await renderIntervencion(interior);
    const v = Object.fromEntries(Object.entries(campos).map(([kk, el]) => [kk, el.value.trim()]));
    const fecha = new Date().toISOString().slice(0, 10);
    const medir = document.createElement('canvas').getContext('2d');
    medir.font = `${40 * S}px ${FUENTE}`; const tit = envolver(medir, v.titulo || 'sin título', interior);
    medir.font = `${24 * S}px ${FUENTE}`; const cons = v.narrativa ? envolver(medir, v.narrativa, interior) : [];
    let alto = P + 44 * S + 88 * S + img.height + 56 * S + tit.length * 50 * S + 20 * S;
    if (cons.length) alto += 30 * S + cons.length * 36 * S + 20 * S;
    if (estado.ubicacion) alto += 70 * S;
    alto += 40 * S + 26 * S * 2 + (estado.base.credito ? 24 * S : 0) + P;
    const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(alto);
    const g = c.getContext('2d');
    g.fillStyle = '#f3f2ef'; g.fillRect(0, 0, W, c.height); g.textBaseline = 'top';
    let y = P;
    g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('máquinas_', P, y); y += 44 * S;
    g.font = `${44 * S}px ${FUENTE}`; g.fillStyle = '#141414'; g.fillText(M.titulo, P, y); y += 88 * S;
    g.drawImage(img, P, y);
    g.lineWidth = 1.5 * S; g.strokeStyle = '#141414'; g.strokeRect(P + 0.5, y + 0.5, interior - 1, img.height - 1);
    y += img.height + 56 * S;
    g.fillStyle = '#141414'; g.font = `${40 * S}px ${FUENTE}`;
    for (const l of tit) { g.fillText(l, P, y); y += 50 * S; }
    y += 20 * S;
    if (cons.length) {
      g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('consigna:/<', P, y); y += 30 * S;
      g.font = `${24 * S}px ${FUENTE}`; g.fillStyle = '#141414';
      for (const l of cons) { g.fillText(l, P, y); y += 36 * S; }
      y += 20 * S;
    }
    if (estado.ubicacion) {
      g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('ubicación:/<', P, y); y += 30 * S;
      g.fillStyle = '#141414'; g.fillText(ubicacionTexto(), P, y); y += 40 * S;
    }
    g.fillStyle = '#141414'; g.fillRect(P, y, interior, 1.5 * S); y += 40 * S;
    g.font = `${20 * S}px ${FUENTE}`;
    g.fillText([v.alias || 'anónimo', v.ciudad, fecha].filter(Boolean).join(' · '), P, y); y += 26 * S;
    g.fillStyle = '#6f6f6c'; g.fillText(`${LICENCIA} · máquinas_ · ${M.credito}`, P, y); y += 26 * S;
    if (estado.base.credito) {
      g.font = `${15 * S}px ${FUENTE}`; g.fillStyle = '#8a8984';
      let t = `imagen base: ${estado.base.credito.autor} · ${estado.base.credito.licencia} · Wikimedia Commons`;
      while (g.measureText(t).width > interior && t.length > 20) t = `${t.slice(0, -4)}…`;
      g.fillText(t, P, y);
    }
    return c;
  }

  // ── mapa (paso 4, opcional) ───────────────────────────────────────────
  let mapa = null;
  function iniciarMapa() {
    if (mapa || !window.L) return;
    const z = estado.ubicacion || INICIO;
    mapa = L.map('mapa').setView([z.lat, z.lng], estado.ubicacion ? 17 : INICIO.zoom);
    mapa.attributionControl.setPrefix(false);
    L.tileLayer(TESELAS, { subdomains: TESELAS.includes('{s}') ? 'abcd' : '', maxZoom: CLAVE_MAPA ? 20 : 19, attribution: ATRIB }).addTo(mapa);
    mapa.on('movestart', () => { if (estado.ubicacion && !moviendo) marcarLugar(false); });
    marcarLugar(!!estado.ubicacion);
  }
  let moviendo = false;
  function marcarLugar(fijo) {
    $('#fijado').hidden = !fijo; $('#fijar').classList.toggle('on', fijo);
    if (!fijo) estado.ubicacion = null;
    $('#estado-zona').textContent = fijo ? `lugar fijado_ ${ubicacionTexto()}` : 'centra el lugar en el mapa y toca «fijar lugar», o salta este paso.';
  }
  $('#fijar').addEventListener('click', () => {
    if (!mapa) return; const c = mapa.getCenter();
    estado.ubicacion = { lat: redondear(c.lat), lng: redondear(c.lng) }; estado.sinUbicacion = false;
    marcarLugar(true); guardar();
  });
  $('#saltar').addEventListener('click', () => { estado.ubicacion = null; estado.sinUbicacion = true; guardar(); irA(5); });
  $('#mi-ubicacion').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    $('#estado-zona').textContent = 'buscando tu ubicación_';
    const pedir = (alta, t) => navigator.geolocation.getCurrentPosition(
      (p) => { mapa.setView([p.coords.latitude, p.coords.longitude], 17); $('#estado-zona').textContent = 'ajusta el encuadre y toca «fijar lugar».'; },
      (err) => {
        if (err.code === 1) $('#estado-zona').textContent = 'tu navegador no tiene permiso de ubicación; mueve el mapa a mano o salta este paso.';
        else if (alta) pedir(false, 20000); else $('#estado-zona').textContent = 'no se encontró tu ubicación; mueve el mapa a mano.';
      }, { enableHighAccuracy: alta, timeout: t, maximumAge: 120000 });
    pedir(true, 8000);
  });

  // ── pasos ─────────────────────────────────────────────────────────────
  function validar(paso) {
    if (paso === 1 && !estado.base) return 'elige una imagen para continuar.';
    if (paso === 2 && !estado.capas.length) return 'intervén la imagen con al menos un trazo, texto o sticker.';
    if (paso === 3 && !campos.titulo.value.trim()) return 'falta el título de tu intervención.';
    if (paso === 4 && !estado.ubicacion && !estado.sinUbicacion) return 'fija el lugar en el mapa o toca «saltar».';
    return null;
  }
  const hayAvance = () => !!(estado.base || estado.capas.length || estado.campos.titulo);
  function reiniciar(conservar) {
    const { alias, ciudad } = estado.campos;
    if (estado.base) db.quitar(estado.base.id);
    estado.capas.filter((c) => c.tipo === 'sticker').forEach((c) => db.quitar(c.id));
    fuentesDe.clear(); imagenes.clear(); historial = []; elegido = null;
    estado = estadoInicial();
    if (conservar) Object.assign(estado.campos, { alias, ciudad });
    Object.entries(campos).forEach(([k, el]) => { el.value = estado.campos[k] || ''; });
    mostrarBase(); $('#vista').removeAttribute('src');
    if (mapa) marcarLugar(false);
    guardar();
  }
  $('#reiniciar').addEventListener('click', () => { if (confirm('¿borrar esta intervención y empezar una nueva?')) { reiniciar(true); irA(1); } });
  $('#nueva').addEventListener('click', () => irA(1));

  async function irA(paso) {
    estado.paso = paso;
    $$('.paso').forEach((s) => { s.hidden = Number(s.dataset.paso) !== paso; });
    $('#progreso').textContent = `${'■'.repeat(paso)}${'□'.repeat(TOTAL - paso)} ${paso}/${TOTAL}`;
    $('#reiniciar').hidden = !hayAvance();
    $('#exito').hidden = true; $('.paso[data-paso="5"]').classList.remove('enviado');
    $('#formulario').hidden = false; $('.vista').hidden = false;
    $('#anterior').style.visibility = paso > 1 ? 'visible' : 'hidden';
    $('#siguiente').style.display = paso === TOTAL ? 'none' : '';
    aviso.textContent = '';
    if (paso === 1) { mostrarBase(); cargarCarrusel(); }
    if (paso === 2) { modo = 'mover'; elegido = null; requestAnimationFrame(pintarEditor); }
    if (paso === 3) { $('#vista-nombrar').src = (await renderIntervencion(900)).toDataURL('image/jpeg', 0.85); }
    if (paso === 4) { iniciarMapa(); setTimeout(() => { if (mapa) { moviendo = true; mapa.invalidateSize(); moviendo = false; } }, 60); }
    if (paso === TOTAL) actualizarVista();
    guardar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#siguiente').addEventListener('click', () => { const err = validar(estado.paso); if (err) { aviso.textContent = err; return; } irA(Math.min(TOTAL, estado.paso + 1)); });
  $('#anterior').addEventListener('click', () => irA(Math.max(1, estado.paso - 1)));
  let temporizador = null;
  Object.values(campos).forEach((el) => el.addEventListener('input', () => { guardar(); if (estado.paso === TOTAL) { clearTimeout(temporizador); temporizador = setTimeout(actualizarVista, 500); } }));

  async function actualizarVista() {
    if (!estado.base) return;
    $('#vista-estado').textContent = 'componiendo pieza_';
    $('#vista').src = (await componer(1)).toDataURL('image/jpeg', 0.85);
    $('#vista-estado').textContent = '';
  }
  function avisoFinal(txt, error = false) { mensaje.textContent = txt; mensaje.classList.toggle('error', error); }
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
    for (const p of [1, 2, 3, 4]) { const err = validar(p); if (err) return avisoFinal(err, true); }
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
    const workerAnterior = (() => { try { return localStorage.getItem('maquinas_worker_png') === '1'; } catch { return false; } })();
    avisoFinal('1/2 · preparando tu pieza_ no cierres esta página.');
    try {
      const v = Object.fromEntries(Object.entries(campos).map(([kk, el]) => [kk, el.value.trim()]));
      v.narrativa = v.narrativa || '—';
      const cuerpo = {
        maquina: M.id, ...v, ubicacion: ubicacionTexto(), licencia: LICENCIA, consentimiento: true,
        website: e.target.website.value, turnstile: token,
        tablero: { ubicacion: estado.ubicacion, base: estado.base.credito ? { fuente: 'Wikimedia Commons', ...estado.base.credito } : { fuente: 'propia' } },
      };
      const mandar = (c) => fetch(CFG.WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
      const comoPng = async () => { let png = (await componer(1.5)).toDataURL('image/png'); if (png.length * 0.75 > 7.5e6) png = (await componer(1)).toDataURL('image/png'); return png; };
      let r;
      if (workerAnterior) { const png = await comoPng(); avisoFinal('2/2 · subiendo tu pieza_'); r = await mandar({ ...cuerpo, png }); }
      else { const imagen = (await componer(2)).toDataURL('image/jpeg', 0.9); avisoFinal('2/2 · subiendo tu pieza_ puede tardar un poco con datos móviles.'); r = await mandar({ ...cuerpo, imagen }); }
      let res = await r.json().catch(() => ({}));
      if (!r.ok && res.error === 'falta la imagen' && !workerAnterior) {
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
      $('.paso[data-paso="5"]').classList.add('enviado'); $('#reiniciar').hidden = true; $('#anterior').style.visibility = 'hidden';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      avisoFinal(`no se pudo enviar: ${ex.message}. tu pieza sigue aquí; intenta de nuevo.`, true);
    } finally {
      window.removeEventListener('beforeunload', noCerrar); boton.disabled = false;
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });

  // ── inicio ────────────────────────────────────────────────────────────
  document.body.classList.toggle('mapa-gris', GRISES);
  recuperar().then(() => irA(estado.paso || 1));
})();
