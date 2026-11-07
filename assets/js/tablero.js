/* máquinas_ · tablero paso a paso
   Asistente de 5 pasos para cada máquina: zona en el mapa → fotos → tablero → narrativa → revisar y enviar.
   La máquina se elige con <body data-maquina="…">. Todo ocurre en el navegador; nada sale hasta que se envía. */
(() => {
  'use strict';

  // ── configuración ─────────────────────────────────────────────────────
  const MAQUINAS = {
    constelaciones_urbanas: {
      titulo: 'máquina_constelaciones_urbanas', credito: 'Diego Deshuesado y Daniel Vázquez',
      narrativa: 'mito', sustantivo: 'constelación', clave: 'maquinas_constelaciones_urbanas_v2',
      unidad: ['luz', 'luces'], opacidad: 0.35, lineas: true, pines: false, pasoFotos: 2, pasoPines: 3,
      faltaTitulo: 'falta el título de tu constelación.', faltaNarrativa: 'falta el mito de tu constelación.',
      faltanFotos: (n) => `fotografía al menos ${n} luces para continuar.`,
      altFoto: 'foto de una luz',
      ayudas: {
        mover: 'mover_ arrastra las fotos. escribe un título en su cédula si quieres.',
        conectar: 'conectar_ toca una luz y luego otra para trazar una línea.',
        punto: '+ punto_ toca un espacio vacío para añadir un punto imaginario.',
        borrar: 'borrar_ toca una línea, una foto o un punto para quitarlo.',
      },
    },
    ficciones_de_mi_barrio: {
      titulo: 'máquina_ficciones_de_mi_barrio', credito: 'Diego Deshuesado',
      narrativa: 'historia', sustantivo: 'historia', clave: 'maquinas_ficciones_de_mi_barrio_v1',
      unidad: ['foto', 'fotos'], opacidad: 0.6, lineas: false, pines: true, pasoFotos: 2, pasoPines: 3,
      faltaTitulo: 'falta el título de tu historia.', faltaNarrativa: 'falta tu historia.',
      faltanFotos: (n) => `toma al menos ${n} fotos para continuar.`,
      altFoto: 'foto de la colonia',
      ayudas: {
        mover: 'mover_ arrastra las fotos. escribe un título en su cédula si quieres.',
        pines: 'arrastra cada pin a la calle donde tomaste la foto. también puedes mover las fotos.',
        borrar: 'borrar_ toca una foto para quitarla junto con su pin.',
      },
    },
  };
  MAQUINAS.poe_arqui_lecturas = {
    titulo: 'máquina_poe_arqui_lecturas', credito: 'Diego Deshuesado',
    narrativa: null, sustantivo: 'narración', clave: 'maquinas_poe_arqui_lecturas_v1',
    unidad: ['foto', 'fotos'], opacidad: 0.6, lineas: false, pines: true, numeros: true, fragmentos: true, poesia: true,
    pasoPoesia: 2, pasoFotos: 3, pasoPines: 3,
    faltaTitulo: 'falta el título de tu narración.',
    faltanFotos: (n) => `toma al menos ${n} fotos para continuar.`,
    altFoto: 'foto de la zona',
    ayudas: {
      mover: 'mover_ arrastra las fotos y sus pines.',
      pines: 'arrastra cada pin numerado a donde tomaste la foto. también puedes mover las fotos.',
      borrar: 'borrar_ toca una foto para quitarla junto con su pin.',
    },
  };
  const ID = MAQUINAS[document.body.dataset.maquina] ? document.body.dataset.maquina : 'constelaciones_urbanas';
  const M = { id: ID, ...MAQUINAS[ID] };
  const LICENCIA = 'CC BY-NC-SA 4.0';
  const CFG = window.MAQUINAS_CONFIG || {};
  const CLAVE = M.clave;
  const TOTAL = 5;
  const MIN_LUCES = 3;
  // mapa: CARTO (gris claro) si hay clave en config.js; si no, OpenStreetMap pasado a escala de grises
  const CLAVE_MAPA = String(CFG.MAPA_KEY || '').trim();
  const TESELAS = CFG.MAPA_TESELAS || (CLAVE_MAPA
    ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png?key=${CLAVE_MAPA}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  const SUBDOMINIOS = TESELAS.includes('{s}') ? 'abcd' : '';
  const MAX_ZOOM = CLAVE_MAPA ? 20 : 19;
  const GRISES = !CLAVE_MAPA && !CFG.MAPA_TESELAS;
  const ATRIB = CLAVE_MAPA ? '© OpenStreetMap © CARTO' : '© OpenStreetMap';
  const INICIO = { lat: 20.5931, lng: -100.3923, zoom: 15 }; // centro de Querétaro mientras no hay ubicación
  const OPACIDAD_MAPA = M.opacidad;
  const TRAZOS = { continua: '', discontinua: '8 6', punteada: '0.1 7' };
  const GROSORES = { fino: 1.2, medio: 2, grueso: 3.4 };
  const COLORES = [
    ['#141414', 'negro'], ['#8a8984', 'gris'], ['#ffffff', 'blanco'], ['#e3a83a', 'ámbar'], ['#b3261e', 'rojo'],
  ];

  // ── estado ────────────────────────────────────────────────────────────
  // tarjeta: { id, src, ar, w, x, y, label, coords }  (x, y = esquina sup. izq. en fracción del tablero)
  // punto imaginario: { id, x, y }  (centro en fracción del tablero)
  const estadoInicial = () => ({
    paso: 1, zona: null, tarjetas: [], puntos: [], lineas: [], poemas: [], orden: [],
    estilo: { trazo: 'continua', color: '#141414', grosor: 'medio' },
    campos: { titulo: '', narrativa: '', alias: '', ciudad: '' },
  });
  let estado = estadoInicial();
  let modo = 'mover';
  let elegida = null;
  const imgs = new Map();

  // ── elementos ─────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const tablero = $('#tablero'), svg = $('#lineas'), fondo = $('#fondo'), vacio = $('#vacio');
  const aviso = $('#aviso'), mensaje = $('#mensaje');
  const campos = Object.fromEntries(Object.entries({ titulo: '#f-titulo', narrativa: '#f-narrativa', alias: '#f-alias', ciudad: '#f-ciudad' })
    .map(([k, sel]) => [k, $(sel)]).filter(([, el]) => el));
  // fotos en el orden de la secuencia (las que no estén en «orden» van al final)
  const ordenadas = () => {
    const porId = new Map(estado.tarjetas.map((t) => [t.id, t]));
    const lista = (estado.orden || []).map((id) => porId.get(id)).filter(Boolean);
    return lista.concat(estado.tarjetas.filter((t) => !lista.includes(t)));
  };
  const numero = (id) => ordenadas().findIndex((t) => t.id === id) + 1;

  const AYUDAS = M.ayudas;
  const conPines = () => M.pines && estado.paso >= (M.pasoPines || 3);

  const uid = () => Math.random().toString(36).slice(2, 9);
  // tamaño del tablero; si está oculto (paso 1 o 5) se usa el último tamaño visible
  let ultimas = null;
  const dims = () => {
    if (tablero.clientWidth) ultimas = { W: tablero.clientWidth, H: tablero.clientHeight };
    if (ultimas) return ultimas;
    const W = Math.min(720, window.innerWidth - 40);
    return { W, H: W * (window.innerWidth <= 640 ? 4 / 3 : 3 / 4) };
  };
  const anchoTarjeta = () => (tablero.clientWidth < 500 ? 0.3 : 0.2);
  const redondear = (n) => Math.round(n * 1000) / 1000; // ~100 m
  const ubicacionTexto = () => (estado.zona ? `${estado.zona.lat.toFixed(3)}, ${estado.zona.lng.toFixed(3)}` : '');
  const nodos = () => [...estado.tarjetas, ...estado.puntos];

  // ── guardar / recuperar (solo en este navegador) ──────────────────────
  // los textos y posiciones van en localStorage; las fotos, que pesan más, en IndexedDB
  const fotosDB = (() => {
    let abierta = null;
    const abrir = () => abierta || (abierta = new Promise((ok, mal) => {
      const r = indexedDB.open('maquinas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }));
    const usar = async (modo, fn) => {
      const db = await abrir();
      return new Promise((ok, mal) => {
        const t = db.transaction('fotos', modo), req = fn(t.objectStore('fotos'));
        t.oncomplete = () => ok(req && req.result);
        t.onerror = () => mal(t.error);
      });
    };
    return {
      poner: (id, src) => usar('readwrite', (s) => s.put(src, id)).catch(() => {}),
      leer: (id) => usar('readonly', (s) => s.get(id)).catch(() => null),
      quitar: (id) => usar('readwrite', (s) => s.delete(id)).catch(() => {}),
    };
  })();

  function guardar() {
    if (aviso) aviso.textContent = '';
    Object.entries(campos).forEach(([k, el]) => { estado.campos[k] = el.value; });
    const ligero = { ...estado, tarjetas: estado.tarjetas.map(({ src, ...resto }) => resto) };
    try { localStorage.setItem(CLAVE, JSON.stringify(ligero)); } catch {}
  }
  async function recuperar() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (d) estado = { ...estado, ...d, estilo: { ...estado.estilo, ...(d.estilo || {}) }, campos: { ...estado.campos, ...(d.campos || {}) } };
    } catch {}
    Object.entries(campos).forEach(([k, el]) => { el.value = estado.campos[k] || ''; });
    for (const t of estado.tarjetas) {
      if (t.src) fotosDB.poner(t.id, t.src); // datos de una versión anterior
      else t.src = await fotosDB.leer(t.id);
    }
    estado.tarjetas = estado.tarjetas.filter((t) => t.src);
  }

  // ── mapa (paso 1) ─────────────────────────────────────────────────────
  let mapa = null, moviendoPorCodigo = false;
  function iniciarMapa() {
    if (mapa || !window.L) return;
    const z = estado.zona || INICIO;
    mapa = L.map('mapa', { zoomControl: true, attributionControl: true }).setView([z.lat, z.lng], z.zoom);
    mapa.attributionControl.setPrefix(false);
    L.tileLayer(TESELAS, { subdomains: SUBDOMINIOS, maxZoom: MAX_ZOOM, crossOrigin: true, attribution: ATRIB, tileSize: 256 }).addTo(mapa);
    mapa.on('movestart zoomstart', () => { if (!moviendoPorCodigo && estado.zona) marcarZona(false); });
    marcarZona(!!estado.zona);
  }
  function marcarZona(fija) {
    $('#fijado').hidden = !fija;
    $('#fijar').classList.toggle('on', fija);
    $('#estado-zona').textContent = fija
      ? `zona fijada_ ${ubicacionTexto()}`
      : 'cuando tengas tu zona en pantalla, toca «fijar zona».';
    if (!fija) estado.zona = null;
  }
  $('#fijar').addEventListener('click', () => {
    if (!mapa) return;
    const c = mapa.getCenter(), el = $('#mapa');
    estado.zona = { lat: c.lat, lng: c.lng, zoom: mapa.getZoom(), w: el.clientWidth, h: el.clientHeight };
    marcarZona(true); aviso.textContent = ''; guardar(); fondoListo = null;
  });
  // ubicación: primero precisa; si tarda, una aproximada; si no hay permiso, se explica cómo darlo
  function ubicar(ok, mal) {
    const pedir = (alta, espera) => navigator.geolocation.getCurrentPosition(ok, (err) => {
      if (err.code === 1) return mal('permiso');
      if (alta) return pedir(false, 20000);
      mal('tiempo');
    }, { enableHighAccuracy: alta, timeout: espera, maximumAge: 120000 });
    pedir(true, 8000);
  }
  $('#mi-ubicacion').addEventListener('click', () => {
    const estadoZona = $('#estado-zona');
    if (!navigator.geolocation) return (estadoZona.textContent = 'tu navegador no permite ubicarte; mueve el mapa a mano.');
    estadoZona.textContent = 'buscando tu ubicación_';
    ubicar(
      (p) => { mapa.setView([p.coords.latitude, p.coords.longitude], 17); estadoZona.textContent = 'ya estás en el mapa. ajusta el encuadre y toca «fijar zona».'; },
      (motivo) => {
        estadoZona.textContent = motivo === 'permiso'
          ? 'tu navegador no tiene permiso de ubicación. en iPhone: Ajustes → Privacidad y seguridad → Localización → Sitios web de Safari → «Al usar la app». también puedes mover el mapa a mano.'
          : 'no se encontró tu ubicación a tiempo; intenta de nuevo o mueve el mapa a mano.';
      },
    );
  });

  // dibuja el mapa de la zona en un lienzo de W×H (para el fondo del tablero y la pieza final)
  function proyectar(lat, lng, z) {
    const s = 256 * 2 ** z, sin = Math.sin((lat * Math.PI) / 180);
    return { x: ((lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
  }
  function cargar(url) {
    return new Promise((ok) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = url; });
  }
  async function dibujarMapa(zona, W, H) {
    const c = document.createElement('canvas'); c.width = Math.round(W); c.height = Math.round(H);
    const g = c.getContext('2d');
    g.fillStyle = '#ecebe8'; g.fillRect(0, 0, c.width, c.height);
    const z = zona.zoom + Math.log2(W / zona.w);
    const tz = Math.max(1, Math.min(MAX_ZOOM, Math.round(z)));
    const s = 2 ** (z - tz), n = 2 ** tz;
    const cp = proyectar(zona.lat, zona.lng, tz);
    const izq = cp.x - W / 2 / s, arr = cp.y - H / 2 / s;
    const tareas = [];
    for (let tx = Math.floor(izq / 256); tx <= Math.floor((izq + W / s) / 256); tx++) {
      for (let ty = Math.max(0, Math.floor(arr / 256)); ty <= Math.min(n - 1, Math.floor((arr + H / s) / 256)); ty++) {
        const wx = ((tx % n) + n) % n;
        const url = TESELAS.replace('{s}', 'abcd'[(wx + ty) % 4]).replace('{z}', tz).replace('{x}', wx).replace('{y}', ty);
        tareas.push(cargar(url).then((im) => { if (im) g.drawImage(im, (tx * 256 - izq) * s, (ty * 256 - arr) * s, 256 * s + 0.6, 256 * s + 0.6); }));
      }
    }
    await Promise.all(tareas);
    if (GRISES) {
      try {
        const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          const l = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
          const v = 236 + (l - 236) * 0.75; // gris claro, poco contraste
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        g.putImageData(d, 0, 0);
      } catch {}
    }
    return c;
  }
  let fondoListo = null;
  async function pintarFondo() {
    const { W, H } = dims();
    if (!estado.zona || !W) { fondo.getContext('2d') && fondo.getContext('2d').clearRect(0, 0, fondo.width, fondo.height); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const clave = `${W}x${H}@${dpr}:${estado.zona.lat},${estado.zona.lng},${estado.zona.zoom}`;
    if (fondoListo === clave) return;
    fondoListo = clave;
    const c = await dibujarMapa(estado.zona, W * dpr, H * dpr);
    if (fondoListo !== clave) return;
    fondo.width = c.width; fondo.height = c.height;
    fondo.getContext('2d').drawImage(c, 0, 0);
  }

  // posición de unas coordenadas dentro del tablero (fracciones 0–1), según la zona fijada
  function aFraccion(lat, lng) {
    const z = estado.zona; if (!z) return null;
    const { W, H } = dims();
    const p = proyectar(lat, lng, z.zoom), c = proyectar(z.lat, z.lng, z.zoom);
    const k = W / z.w;
    return { x: 0.5 + ((p.x - c.x) * k) / W, y: 0.5 + ((p.y - c.y) * k) / H };
  }
  const limitar = (n, a = 0.02, b = 0.98) => Math.min(b, Math.max(a, n));

  // ── fotos (paso 2) ────────────────────────────────────────────────────
  function reducir(file, max = 1400) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok({ src: c.toDataURL('image/jpeg', 0.88), ar: c.height / c.width });
      };
      im.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen')); };
      im.src = url;
    });
  }
  async function coordenadasSiPermitidas() {
    try {
      if (!navigator.permissions || !navigator.geolocation) return null;
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state !== 'granted') return null;
      return await new Promise((ok) => navigator.geolocation.getCurrentPosition(
        (pos) => ok({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => ok(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }));
    } catch { return null; }
  }
  $$('.entrada-foto').forEach((entrada) => entrada.addEventListener('change', async (e) => {
    const archivos = [...e.target.files].filter((f) => f.type.startsWith('image/'));
    const coords = e.target.id === 'camara' ? await coordenadasSiPermitidas() : null;
    const w = anchoTarjeta(), { W, H } = dims();
    for (const [i, f] of archivos.entries()) {
      try {
        const { src, ar } = await reducir(f);
        // se acomodan en cuadrícula con un ligero desfase; luego la persona las mueve
        const n = estado.tarjetas.length;
        const altoFrac = (w * W * ar + 22) / H;
        const cols = Math.max(2, Math.floor(0.94 / (w + 0.04)));
        const filas = Math.max(1, Math.floor(0.94 / (altoFrac + 0.04)));
        const col = n % cols, fila = Math.floor(n / cols) % filas;
        const jitter = ((n * 37) % 7) / 100;
        const id = uid();
        await fotosDB.poner(id, src);
        // se guardan redondeadas (~100 m); la posición exacta solo se usa para colocar el pin
        const t = {
          id, src, ar, w, label: '', coords: coords && { lat: redondear(coords.lat), lng: redondear(coords.lng) },
          x: Math.min(0.03 + col * (0.94 / cols) + jitter / 2, 1 - w),
          y: Math.min(0.03 + fila * (altoFrac + 0.05) + jitter, Math.max(0, 1 - altoFrac)),
        };
        if (M.pines) {
          // con coordenadas, el pin va donde se tomó la foto; si no, cerca de la foto para que la persona lo ubique
          const f = coords && aFraccion(coords.lat, coords.lng);
          t.pin = f ? { x: limitar(f.x), y: limitar(f.y, 0.06) } : { x: limitar(t.x + w / 2 + 0.06), y: limitar(t.y + altoFrac + 0.08, 0.06) };
          t.ubicada = !!f;
        }
        estado.tarjetas.push(t);
        estado.orden.push(t.id);
      } catch { aviso.textContent = 'no se pudo leer una de las imágenes.'; }
    }
    e.target.value = '';
    pintar(); guardar();
  }));

  // ── pintar el tablero ─────────────────────────────────────────────────
  function contarLuces() {
    const el = $('#conteo-luces'); if (!el) return;
    const n = estado.tarjetas.length;
    if (!n) { el.textContent = ''; el.classList.remove('listo'); return; }
    const listo = n >= MIN_LUCES;
    el.classList.toggle('listo', listo);
    const [uno, varios] = M.unidad;
    el.textContent = listo
      ? `${n} ${varios}_ ✓ puedes seguir sumando más.`
      : `${n} de ${MIN_LUCES} ${varios} mínimo_ faltan ${MIN_LUCES - n}.`;
    void uno;
  }

  function pintar() {
    contarLuces();
    tablero.querySelectorAll('.nodo').forEach((n) => n.remove());
    vacio.style.display = estado.tarjetas.length || estado.puntos.length ? 'none' : '';
    const { W } = dims();
    const editable = estado.paso >= 2 && estado.paso <= 4;
    for (const t of estado.tarjetas.filter((x) => x.src)) {
      const el = document.createElement('div');
      el.className = 'tarjeta nodo' + (elegida === t.id ? ' elegida' : '');
      el.dataset.id = t.id;
      el.style.left = `${t.x * 100}%`; el.style.top = `${t.y * 100}%`; el.style.width = `${t.w * W}px`;
      const img = document.createElement('img');
      img.src = t.src; img.alt = t.label || M.altFoto; img.draggable = false;
      if (M.numeros) {
        const ced = document.createElement('span'); ced.className = 'ced-num'; ced.textContent = `${numero(t.id)}_`;
        el.append(img, ced); tablero.appendChild(el);
        if (t.src && (!imgs.has(t.id) || imgs.get(t.id).src !== t.src)) { const im = new Image(); im.src = t.src; imgs.set(t.id, im); }
        continue;
      }
      const inp = document.createElement('input');
      inp.value = t.label; inp.maxLength = 40; inp.placeholder = 'título_';
      inp.setAttribute('aria-label', 'título de esta foto');
      inp.readOnly = !(editable && (modo === 'mover'));
      inp.addEventListener('input', () => {
        t.label = inp.value; img.alt = inp.value || M.altFoto; guardar();
        const espejo = document.querySelector(`#lista-fotos input[data-id="${t.id}"]`); if (espejo) espejo.value = inp.value;
      });
      inp.addEventListener('pointerdown', (ev) => { if (!inp.readOnly) ev.stopPropagation(); });
      el.append(img, inp);
      tablero.appendChild(el);
      if (t.src && (!imgs.has(t.id) || imgs.get(t.id).src !== t.src)) { const im = new Image(); im.src = t.src; imgs.set(t.id, im); }
    }
    if (conPines()) {
      for (const t of estado.tarjetas.filter((x) => x.src && x.pin)) {
        const el = document.createElement('div');
        el.className = 'pin nodo';
        el.dataset.pin = t.id;
        el.style.left = `${t.pin.x * 100}%`; el.style.top = `${t.pin.y * 100}%`;
        el.title = 'arrastra el pin a la calle donde tomaste la foto';
        el.innerHTML = M.numeros
          ? `<svg viewBox="0 0 14 18" aria-hidden="true"><path d="M7 17 C7 17 1 10 1 6.5 A6 6 0 0 1 13 6.5 C13 10 7 17 7 17Z" fill="#141414" stroke="#fff" stroke-width="1.2"/></svg><span class="pin-n">${numero(t.id)}</span>`
          : '<svg viewBox="0 0 14 18" aria-hidden="true"><path d="M7 17 C7 17 1 10 1 6.5 A6 6 0 0 1 13 6.5 C13 10 7 17 7 17Z" fill="#141414" stroke="#fff" stroke-width="1.2"/><circle cx="7" cy="6.5" r="2" fill="#fff"/></svg>';
        tablero.appendChild(el);
      }
    }
    for (const p of estado.puntos) {
      const el = document.createElement('div');
      el.className = 'estrella nodo' + (elegida === p.id ? ' elegida' : '');
      el.dataset.id = p.id;
      el.style.left = `${p.x * 100}%`; el.style.top = `${p.y * 100}%`;
      el.style.borderColor = estado.estilo.color === '#ffffff' ? '#141414' : estado.estilo.color;
      el.title = 'punto imaginario';
      tablero.appendChild(el);
    }
    trazar();
  }

  function centro(id) {
    const { W, H } = dims();
    const p = estado.puntos.find((x) => x.id === id);
    if (p) return { x: p.x * W, y: p.y * H, imaginario: true };
    const t = estado.tarjetas.find((x) => x.id === id);
    if (!t) return null;
    const img = tablero.querySelector(`.tarjeta[data-id="${t.id}"] img`);
    const w = t.w * W, h = img && img.offsetHeight ? img.offsetHeight : w * t.ar;
    return { x: t.x * W + w / 2, y: t.y * H + h / 2 };
  }

  function trazar() {
    const { W, H } = dims();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ids = new Set(nodos().map((n) => n.id));
    estado.lineas = estado.lineas.filter(([a, b]) => ids.has(a) && ids.has(b));
    const e = estado.estilo, gw = GROSORES[e.grosor], dash = TRAZOS[e.trazo];
    const halo = e.color === '#ffffff' ? 'rgba(20,20,20,.55)' : 'rgba(255,255,255,.85)';
    let html = '';
    const extremos = new Map();
    estado.lineas.forEach(([a, b], i) => {
      const p = centro(a), q = centro(b);
      if (!p || !q) return;
      if (!p.imaginario) extremos.set(a, p);
      if (!q.imaginario) extremos.set(b, q);
      const xy = `x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"`;
      html += `<g data-i="${i}"><line class="toque" ${xy}/>
        <line ${xy} stroke="${halo}" stroke-width="${gw + 2.2}" stroke-dasharray="${dash}" stroke-linecap="round"/>
        <line class="trazo" ${xy} stroke="${e.color}" stroke-width="${gw}" stroke-dasharray="${dash}" stroke-linecap="round"/></g>`;
    });
    for (const p of extremos.values()) html += `<circle cx="${p.x}" cy="${p.y}" r="${3 + gw}" fill="${e.color}" stroke="${e.color === '#ffffff' ? '#141414' : '#fff'}" stroke-width="1.5"/>`;
    if (conPines()) {
      for (const t of estado.tarjetas.filter((x) => x.src && x.pin)) {
        const c = centro(t.id); if (!c) continue;
        html += `<line x1="${c.x}" y1="${c.y}" x2="${t.pin.x * W}" y2="${t.pin.y * H}" stroke="#fff" stroke-width="2.6" opacity=".7"/>
          <line x1="${c.x}" y1="${c.y}" x2="${t.pin.x * W}" y2="${t.pin.y * H}" stroke="#141414" stroke-width="1" stroke-dasharray="3 3"/>`;
      }
    }
    svg.innerHTML = html;
    svg.querySelectorAll('line.toque').forEach((ln) => {
      ln.style.pointerEvents = modo === 'borrar' ? 'stroke' : 'none';
      ln.addEventListener('click', () => { estado.lineas.splice(Number(ln.parentNode.dataset.i), 1); trazar(); guardar(); });
    });
  }

  // ── modos e interacción ───────────────────────────────────────────────
  function cambiarModo(m) {
    modo = m; elegida = null;
    $$('[data-modo]').forEach((b) => b.classList.toggle('on', b.dataset.modo === m));
    tablero.className = `tablero marco modo-${m}`;
    const seccion = $(`.paso[data-paso="${estado.paso}"]`);
    const texto = conPines() && m === 'mover' && AYUDAS.pines ? AYUDAS.pines : AYUDAS[m];
    $$('[data-ayuda]', seccion).forEach((p) => { p.textContent = texto || ''; });
    pintar();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]'); if (b) cambiarModo(b.dataset.modo);
  });

  let arrastre = null;
  tablero.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.nodo');
    const r = tablero.getBoundingClientRect();
    if (el && el.classList.contains('pin')) {
      const t = estado.tarjetas.find((x) => x.id === el.dataset.pin);
      if (!t || modo === 'borrar') return;
      e.preventDefault();
      arrastre = { pin: t, el };
      el.classList.add('arrastrando');
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (!el) {
      if (modo === 'punto' && estado.paso === 3 && !e.target.closest('line')) {
        estado.puntos.push({ id: uid(), x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
        pintar(); guardar();
      } else if (modo === 'conectar' && elegida) { elegida = null; pintar(); }
      return;
    }
    const id = el.dataset.id;
    const nodo = nodos().find((n) => n.id === id);
    if (!nodo) return;
    e.preventDefault();

    if (modo === 'borrar') {
      estado.tarjetas = estado.tarjetas.filter((x) => x.id !== id);
      estado.puntos = estado.puntos.filter((x) => x.id !== id);
      estado.orden = (estado.orden || []).filter((x) => x !== id);
      imgs.delete(id); fotosDB.quitar(id); pintar(); guardar(); return;
    }
    if (modo === 'conectar') {
      if (!elegida) { elegida = id; pintar(); return; }
      if (elegida !== id) {
        const ya = estado.lineas.some(([a, b]) => (a === elegida && b === id) || (a === id && b === elegida));
        if (!ya) estado.lineas.push([elegida, id]);
        elegida = id; guardar();
      } else elegida = null;
      pintar(); return;
    }
    if (modo !== 'mover' && modo !== 'punto') return;
    const esPunto = el.classList.contains('estrella');
    if (!esPunto) {
      estado.tarjetas = estado.tarjetas.filter((x) => x !== nodo).concat(nodo);
      tablero.appendChild(el);
    }
    arrastre = { nodo, el, esPunto, dx: e.clientX - r.left - nodo.x * r.width, dy: e.clientY - r.top - nodo.y * r.height };
    el.classList.add('arrastrando');
    el.setPointerCapture(e.pointerId);
  });
  tablero.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    if (arrastre.pin) {
      const r = tablero.getBoundingClientRect(), t = arrastre.pin;
      t.pin = { x: limitar((e.clientX - r.left) / r.width), y: limitar((e.clientY - r.top) / r.height, 0.06) };
      t.ubicada = true;
      arrastre.el.style.left = `${t.pin.x * 100}%`; arrastre.el.style.top = `${t.pin.y * 100}%`;
      trazar(); return;
    }
    const r = tablero.getBoundingClientRect(), { nodo, el, esPunto } = arrastre;
    const wf = esPunto ? 0 : nodo.w, hf = esPunto ? 0 : el.offsetHeight / r.height;
    nodo.x = Math.min(Math.max((e.clientX - r.left - arrastre.dx) / r.width, 0), 1 - wf);
    nodo.y = Math.min(Math.max((e.clientY - r.top - arrastre.dy) / r.height, 0), Math.max(0, 1 - hf));
    el.style.left = `${nodo.x * 100}%`; el.style.top = `${nodo.y * 100}%`;
    trazar();
  });
  const soltar = () => { if (arrastre) { arrastre.el.classList.remove('arrastrando'); arrastre = null; guardar(); } };
  tablero.addEventListener('pointerup', soltar);
  tablero.addEventListener('pointercancel', soltar);
  new ResizeObserver(() => { pintar(); pintarFondo(); }).observe(tablero);

  // ── estilo de línea (paso 3) ──────────────────────────────────────────
  if ($('#colores')) $('#colores').innerHTML = COLORES.map(([c, n]) =>
    `<button class="muestra" data-color="${c}" style="background:${c}" aria-label="${n}" title="${n}"></button>`).join('');
  function marcarEstilo() {
    const e = estado.estilo;
    $$('[data-trazo]').forEach((b) => b.classList.toggle('on', b.dataset.trazo === e.trazo));
    $$('[data-grosor]').forEach((b) => b.classList.toggle('on', b.dataset.grosor === e.grosor));
    $$('[data-color]').forEach((b) => b.classList.toggle('sel', b.dataset.color === e.color));
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-trazo],[data-grosor],[data-color]');
    if (!b) return;
    if (b.dataset.trazo) estado.estilo.trazo = b.dataset.trazo;
    if (b.dataset.grosor) estado.estilo.grosor = b.dataset.grosor;
    if (b.dataset.color) estado.estilo.color = b.dataset.color;
    marcarEstilo(); pintar(); guardar();
  });

  // ── pasos ─────────────────────────────────────────────────────────────
  function validar(paso) {
    if (paso === 1 && !estado.zona) return 'fija tu zona en el mapa para continuar.';
    if (paso === M.pasoPoesia && !estado.poemas.length) return 'guarda al menos un fragmento para continuar.';
    if (paso === M.pasoFotos && estado.tarjetas.length < MIN_LUCES) return M.faltanFotos(MIN_LUCES);
    if (paso === 3 && M.lineas && !estado.lineas.length) return 'traza al menos una línea entre tus luces.';
    if (paso === 4 && !campos.titulo.value.trim()) return M.faltaTitulo;
    if (paso === 4 && campos.narrativa && !campos.narrativa.value.trim()) return M.faltaNarrativa;
    if (paso === 4 && M.fragmentos) {
      const i = ordenadas().findIndex((t) => !(t.fragmento || '').trim());
      if (i >= 0) return `falta el fragmento de la foto ${i + 1}.`;
      if (textoNarrativa().length > 2900) return 'los fragmentos son demasiado largos; recórtalos un poco.';
    }
    return null;
  }
  const hayAvance = () => !!(estado.zona || estado.tarjetas.length || estado.puntos.length || estado.poemas.length ||
    estado.campos.titulo || estado.campos.narrativa);

  // borra la constelación de este navegador (fotos incluidas); alias y ciudad se conservan si se pide
  function reiniciar(conservarDatos) {
    const { alias, ciudad } = estado.campos;
    estado.tarjetas.forEach((t) => fotosDB.quitar(t.id));
    imgs.clear();
    estado = estadoInicial();
    if (conservarDatos) Object.assign(estado.campos, { alias, ciudad });
    Object.entries(campos).forEach(([k, el]) => { el.value = estado.campos[k] || ''; });
    fondoListo = null;
    if (mapa) marcarZona(false);
    $('#vista').removeAttribute('src');
    guardar();
  }
  $('#reiniciar').addEventListener('click', () => {
    if (!confirm(`¿borrar esta ${M.sustantivo} y empezar una nueva?`)) return;
    reiniciar(true); irA(1);
  });
  $('#nueva').addEventListener('click', () => irA(1));

  // lista de fotos con su título (paso 4 de ficciones)
  function pintarLista() {
    const lista = $('#lista-fotos'); if (!lista) return;
    lista.innerHTML = '';
    for (const t of estado.tarjetas.filter((x) => x.src)) {
      const fila = document.createElement('div'); fila.className = 'foto-fila';
      const im = document.createElement('img'); im.src = t.src; im.alt = '';
      const inp = document.createElement('input');
      inp.value = t.label; inp.maxLength = 40; inp.placeholder = 'título (opcional)'; inp.dataset.id = t.id;
      inp.setAttribute('aria-label', 'título de esta foto');
      inp.addEventListener('input', () => {
        t.label = inp.value; guardar();
        const enTablero = tablero.querySelector(`.tarjeta[data-id="${t.id}"] input`); if (enTablero) enTablero.value = inp.value;
      });
      fila.append(im, inp); lista.appendChild(fila);
    }
  }

  // ── poesía (poe_arqui_lecturas) ───────────────────────────────────────
  // los poemas vienen de Wikisource en español (dominio público); también se puede pegar un texto propio
  const WS = 'https://es.wikisource.org/w/api.php';
  const POETAS = [
    'Sor Juana Inés de la Cruz', 'Rubén Darío', 'Amado Nervo', 'José Martí', 'Gustavo Adolfo Bécquer',
    'Ramón López Velarde', 'Manuel Gutiérrez Nájera', 'José Asunción Silva', 'Julián del Casal', 'Rosalía de Castro',
    'Garcilaso de la Vega', 'Luis de Góngora', 'Francisco de Quevedo', 'Lope de Vega', 'San Juan de la Cruz',
    'Fray Luis de León', 'José de Espronceda', 'José Zorrilla', 'Manuel Acuña', 'Manuel José Othón',
    'Delmira Agustini', 'Julio Herrera y Reissig', 'Gertrudis Gómez de Avellaneda', 'José María Heredia',
    'Jorge Manrique', 'Santa Teresa de Jesús', 'Ricardo Palma', 'Juan de Dios Peza', 'Antonio Plaza', 'Salvador Rueda',
  ];
  const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
  const textoNarrativa = () => ordenadas().map((t, i) => `${i + 1}. ${(t.fragmento || '').trim()}`).join('\n\n');

  async function wsPedir(params) {
    const u = new URL(WS);
    Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u.toString());
    if (!r.ok) throw new Error(`wikisource ${r.status}`);
    return r.json();
  }
  async function wsBuscar(q) {
    const d = await wsPedir({ action: 'query', list: 'search', srsearch: `${q} insource:poem`, srnamespace: '0', srlimit: '30', srprop: 'size' });
    return ((d.query && d.query.search) || []).filter((r) => r.size > 120 && r.size < 20000).map((r) => r.title);
  }
  // título sin la ruta del libro ni la aclaración entre paréntesis (que suele ser el autor)
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
    const lineas = t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
    const out = [];
    for (const l of lineas) { if (l || (out.length && out[out.length - 1])) out.push(l); }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }
  async function wsPoema(titulo) {
    const d = await wsPedir({ action: 'parse', page: titulo, prop: 'wikitext', redirects: '1' });
    const versos = wsVersos((d.parse && d.parse.wikitext) || '');
    if (versos.filter(Boolean).length < 2) throw new Error('sin versos');
    return { titulo: tituloLimpio(titulo), versos };
  }

  let poemaAbierto = null;
  // un fragmento guardado se puede leer completo; también sirve de referencia en el paso de las fotos
  function bloquePoesia(p, quitar) {
    const fila = document.createElement('div'); fila.className = 'mi-poema';
    const cab = document.createElement('div'); cab.className = 'mi-poema-cab';
    const t = document.createElement('span'); t.textContent = p.titulo; cab.appendChild(t);
    if (quitar) {
      const x = document.createElement('button'); x.className = 'quitar'; x.textContent = '×'; x.setAttribute('aria-label', `quitar ${p.titulo}`);
      x.addEventListener('click', () => { estado.poemas = estado.poemas.filter((q) => q.id !== p.id); guardar(); pintarPoesia(); });
      cab.appendChild(x);
    }
    const v = document.createElement('div'); v.className = 'mi-poema-versos';
    p.versos.forEach((l) => { const d = document.createElement('p'); d.className = l ? 'verso' : 'verso vacio'; d.textContent = l || ' '; v.appendChild(d); });
    fila.append(cab, v);
    return fila;
  }
  function pintarPoesia() {
    const caja = $('#mis-poemas'); if (!caja) return;
    caja.innerHTML = '';
    estado.poemas.forEach((p) => caja.appendChild(bloquePoesia(p, true)));
    const n = estado.poemas.length;
    $('#n-poemas').textContent = `${n} ${n === 1 ? 'fragmento' : 'fragmentos'}`;
  }
  function pintarPoesiaRef() {
    const caja = $('#poesia-ref'); if (!caja) return;
    caja.hidden = !estado.poemas.length;
    const lista = $('#poesia-ref-lista'); lista.innerHTML = '';
    estado.poemas.forEach((p) => lista.appendChild(bloquePoesia(p, false)));
  }
  // el poema abierto: toca versos (o ¶ para la estrofa completa) y guarda solo lo elegido
  function abrirPoema(p) {
    poemaAbierto = p;
    $('#ws-poema').hidden = false;
    $('#ws-poema-t').textContent = p.titulo;
    const v = $('#ws-versos'); v.innerHTML = '';
    let estrofa = null;
    p.versos.forEach((l, i) => {
      if (!l) { estrofa = null; const d = document.createElement('p'); d.className = 'verso vacio'; d.textContent = ' '; v.appendChild(d); return; }
      if (!estrofa) {
        estrofa = document.createElement('div'); estrofa.className = 'estrofa';
        const b = document.createElement('button'); b.type = 'button'; b.className = 'parrafo'; b.textContent = '¶'; b.setAttribute('aria-label', 'elegir la estrofa completa');
        const e = estrofa;
        b.addEventListener('click', () => { const vs = [...e.querySelectorAll('.verso')], todos = vs.every((x) => x.classList.contains('sel')); vs.forEach((x) => x.classList.toggle('sel', !todos)); contarSel(); });
        estrofa.appendChild(b); v.appendChild(estrofa);
      }
      const d = document.createElement('p'); d.className = 'verso'; d.textContent = l; d.dataset.i = i;
      d.addEventListener('click', () => { d.classList.toggle('sel'); contarSel(); });
      estrofa.appendChild(d);
    });
    contarSel();
    $('#ws-poema').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function contarSel() {
    const n = $$('#ws-versos .verso.sel').length;
    $('#ws-guardar').textContent = n ? `guardar ${n} ${n === 1 ? 'verso' : 'versos'}_ +` : 'guardar todo el poema_ +';
  }
  async function abrirTitulo(titulo) {
    $('#ws-estado').textContent = 'abriendo poema_';
    try { abrirPoema(await wsPoema(titulo)); $('#ws-estado').textContent = ''; }
    catch { $('#ws-estado').textContent = 'no se pudo leer ese poema; prueba con otro.'; }
  }
  function mostrarResultados(titulos) {
    const caja = $('#ws-resultados'); caja.innerHTML = '';
    titulos.slice(0, 20).forEach((t) => {
      const b = document.createElement('button'); b.className = 'resultado'; b.textContent = tituloLimpio(t);
      b.addEventListener('click', () => abrirTitulo(t));
      caja.appendChild(b);
    });
  }
  if (M.poesia && $('#ws-buscar')) {
    const buscar = async () => {
      const q = $('#ws-q').value.trim();
      if (!q) { $('#ws-estado').textContent = 'escribe un poeta o una palabra, o prueba «al azar».'; return; }
      $('#ws-estado').textContent = 'buscando_';
      try {
        const r = await wsBuscar(q);
        mostrarResultados(r);
        $('#ws-estado').textContent = r.length ? 'toca un poema para leerlo.' : 'sin resultados; prueba otra palabra.';
      } catch { $('#ws-estado').textContent = 'la biblioteca no respondió; revisa tu conexión e intenta de nuevo.'; }
    };
    $('#ws-buscar').addEventListener('click', buscar);
    $('#ws-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
    $('#ws-azar').addEventListener('click', async () => {
      $('#ws-estado').textContent = 'sacando un poema al azar_';
      $('#ws-resultados').innerHTML = '';
      for (let intento = 0; intento < 4; intento++) {
        try {
          const r = await wsBuscar(`"${azar(POETAS)}"`);
          if (!r.length) continue;
          abrirPoema(await wsPoema(azar(r)));
          $('#ws-estado').textContent = '¿otro? toca «al azar» de nuevo.';
          return;
        } catch {}
      }
      $('#ws-estado').textContent = 'la biblioteca no respondió; intenta de nuevo.';
    });
    $('#ws-guardar').addEventListener('click', () => {
      if (!poemaAbierto) return;
      const sel = $$('#ws-versos .verso.sel').map((d) => Number(d.dataset.i));
      let versos = poemaAbierto.versos;
      if (sel.length) {   // conserva los saltos entre partes no seguidas
        versos = [];
        sel.forEach((i, k) => { if (k && i !== sel[k - 1] + 1) versos.push(''); versos.push(poemaAbierto.versos[i]); });
      }
      estado.poemas.push({ id: uid(), titulo: poemaAbierto.titulo, versos });
      guardar(); pintarPoesia(); abrirPoema(poemaAbierto);
      $('#ws-estado').textContent = 'guardado_ puedes elegir más versos o buscar otro poema.';
    });
    $('#propio-guardar').addEventListener('click', () => {
      const txt = $('#propio-txt').value.trim();
      if (!txt) return;
      const versos = txt.split('\n').map((l) => l.trim());
      estado.poemas.push({ id: uid(), titulo: `texto propio · ${versos.find(Boolean).slice(0, 24)}`, versos });
      $('#propio-txt').value = ''; guardar(); pintarPoesia();
    });
  }

  // paso 4: cada foto con su fragmento, en orden
  function pintarListaPoe() {
    const lista = $('#lista-poe'); if (!lista) return;
    lista.innerHTML = '';
    const fotos = ordenadas();
    fotos.forEach((t, i) => {
      const fila = document.createElement('div'); fila.className = 'poe-fila';
      fila.innerHTML = `<div class="poe-cab"><span class="num">${i + 1}</span><img alt=""><span class="esp"></span>
        <button class="herr chica" data-mover="-1" aria-label="subir">↑</button><button class="herr chica" data-mover="1" aria-label="bajar">↓</button></div>
        <textarea maxlength="400" placeholder="fragmento_ escribe o elige versos" aria-label="fragmento de la foto ${i + 1}"></textarea>
        <button class="herr chica elegir">elegir versos_</button><div class="selector" hidden></div>`;
      fila.querySelector('img').src = t.src;
      const ta = fila.querySelector('textarea');
      ta.value = t.fragmento || '';
      ta.addEventListener('input', () => { t.fragmento = ta.value; guardar(); });
      fila.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => {
        const orden = fotos.map((x) => x.id), j = i + Number(b.dataset.mover);
        if (j < 0 || j >= orden.length) return;
        [orden[i], orden[j]] = [orden[j], orden[i]];
        estado.orden = orden; guardar(); pintarListaPoe(); pintar();
      }));
      const sel = fila.querySelector('.selector');
      fila.querySelector('.elegir').addEventListener('click', () => {
        if (!sel.hidden) { sel.hidden = true; return; }
        if (!estado.poemas.length) { sel.hidden = false; sel.textContent = 'aún no guardas poemas; vuelve al paso 2.'; return; }
        sel.hidden = false; sel.innerHTML = '';
        const opciones = document.createElement('select');
        estado.poemas.forEach((p, k) => { const o = document.createElement('option'); o.value = k; o.textContent = p.titulo; opciones.appendChild(o); });
        const versos = document.createElement('div'); versos.className = 'versos';
        const pintarVersos = () => {
          versos.innerHTML = '';
          estado.poemas[opciones.value].versos.forEach((l) => {
            const d = document.createElement('p'); d.className = l ? 'verso' : 'verso vacio'; d.textContent = l || ' ';
            if (l) d.addEventListener('click', () => d.classList.toggle('sel'));
            versos.appendChild(d);
          });
        };
        opciones.addEventListener('change', pintarVersos); pintarVersos();
        const usar = document.createElement('button'); usar.className = 'boton chica'; usar.textContent = 'usar_';
        usar.addEventListener('click', () => {
          const elegidos = [...versos.querySelectorAll('.verso.sel')].map((d) => d.textContent);
          if (!elegidos.length) return;
          ta.value = elegidos.join('\n').slice(0, 400); t.fragmento = ta.value; guardar(); sel.hidden = true; ta.focus();
        });
        const ayuda = document.createElement('p'); ayuda.className = 'ayuda'; ayuda.textContent = 'toca los versos que quieras usar.';
        sel.append(opciones, ayuda, versos, usar);
      });
      lista.appendChild(fila);
    });
  }

  function irA(paso) {
    estado.paso = paso;
    $$('.paso').forEach((s) => { s.hidden = Number(s.dataset.paso) !== paso; });
    $('#progreso').textContent = `${'■'.repeat(paso)}${'□'.repeat(TOTAL - paso)} ${paso}/${TOTAL}`;
    $('#reiniciar').hidden = !hayAvance();
    $('#exito').hidden = true;
    $('.paso[data-paso="5"]').classList.remove('enviado');
    $('#formulario').hidden = false;
    $('.vista').hidden = false;
    $('#anterior').style.visibility = paso > 1 ? 'visible' : 'hidden';
    $('#siguiente').style.display = paso === TOTAL ? 'none' : '';
    aviso.textContent = '';
    const slot = $(`.paso[data-paso="${paso}"] [data-slot]`);
    (slot || $('#guardado')).appendChild(tablero);
    if (paso === 1) {
      iniciarMapa();
      setTimeout(() => { if (!mapa) return; moviendoPorCodigo = true; mapa.invalidateSize(); moviendoPorCodigo = false; }, 50);
    }
    cambiarModo('mover');
    marcarEstilo();
    if (paso >= 2 && paso <= 4) { fondoListo = null; pintarFondo(); }
    if (paso === 4) { pintarLista(); pintarListaPoe(); }
    if (paso === M.pasoPoesia) pintarPoesia();
    if (M.poesia && paso === M.pasoFotos) pintarPoesiaRef();
    if (paso === TOTAL) actualizarVista();
    guardar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#siguiente').addEventListener('click', () => {
    const err = validar(estado.paso);
    if (err) { aviso.textContent = err; return; }
    irA(Math.min(TOTAL, estado.paso + 1));
  });
  $('#anterior').addEventListener('click', () => irA(Math.max(1, estado.paso - 1)));
  Object.values(campos).forEach((el) => el.addEventListener('input', () => { guardar(); if (estado.paso === TOTAL) programarVista(); }));

  // ── componer la pieza final ───────────────────────────────────────────
  const FUENTE = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
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
  async function esperarImagenes() {
    await Promise.all(estado.tarjetas.filter((t) => t.src).map((t) => {
      let im = imgs.get(t.id);
      if (!im || im.src !== t.src || (im.complete && !im.naturalWidth)) { im = new Image(); im.src = t.src; imgs.set(t.id, im); }
      if (im.complete) return null;
      return new Promise((ok) => {
        im.addEventListener('load', ok, { once: true });
        im.addEventListener('error', ok, { once: true });
        setTimeout(ok, 8000);
      });
    }));
  }
  async function componer(S = 2, conMapa = true) {
    if (M.fragmentos) return componerSecuencia(S, conMapa);
    try { await document.fonts.load(`20px "Share Tech Mono"`); } catch {}
    await esperarImagenes();
    const W = 1400 * S, P = 72 * S, interior = W - P * 2;
    const { W: bw, H: bh } = dims();
    const esc = interior / bw, k = S * Math.min(1256 / bw, 1.6);
    const BH = Math.round(bh * esc);
    const v = Object.fromEntries(Object.entries(campos).map(([kk, el]) => [kk, el.value.trim()]));
    const fecha = new Date().toISOString().slice(0, 10);
    const e = estado.estilo;

    const medir = document.createElement('canvas').getContext('2d');
    medir.font = `${40 * S}px ${FUENTE}`; const tit = envolver(medir, v.titulo || 'sin título', interior);
    medir.font = `${24 * S}px ${FUENTE}`; const narr = envolver(medir, v.narrativa || '—', interior);

    let alto = P + 44 * S + 88 * S + BH + 56 * S + tit.length * 50 * S + 24 * S + 30 * S + narr.length * 36 * S + 24 * S;
    if (estado.zona) alto += 70 * S;
    alto += 60 * S + 26 * S * 3 + P;

    const c = document.createElement('canvas');
    c.width = W; c.height = Math.ceil(alto);
    const g = c.getContext('2d');
    g.fillStyle = '#f3f2ef'; g.fillRect(0, 0, W, c.height);
    g.textBaseline = 'top';
    let y = P;
    g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('máquinas_', P, y); y += 44 * S;
    g.font = `${44 * S}px ${FUENTE}`; g.fillStyle = '#141414'; g.fillText(M.titulo, P, y); y += 88 * S;

    // tablero con el mapa translúcido
    const ox = P, oy = y;
    g.fillStyle = '#ffffff'; g.fillRect(ox, oy, interior, BH);
    if (conMapa && estado.zona) {
      const mc = await dibujarMapa(estado.zona, interior, BH);
      g.save(); g.globalAlpha = OPACIDAD_MAPA; g.drawImage(mc, ox, oy); g.restore();
    }
    g.save(); g.beginPath(); g.rect(ox, oy, interior, BH); g.clip();
    const centros = new Map();
    const etH = 22 * k;
    for (const t of estado.tarjetas) {
      const im = imgs.get(t.id);
      const x = ox + t.x * interior, yy = oy + t.y * BH, w = t.w * interior, h = w * t.ar;
      g.fillStyle = '#fff'; g.fillRect(x, yy, w, h + etH);
      if (im && im.naturalWidth) g.drawImage(im, x, yy, w, h);
      g.fillStyle = '#141414'; g.fillRect(x, yy + h, w, etH);
      if (t.label) {
        g.fillStyle = '#f3f2ef'; g.font = `${Math.round(12 * k)}px ${FUENTE}`; g.textBaseline = 'middle';
        let s = t.label; while (s && g.measureText(s).width > w - 12 * k) s = s.slice(0, -1);
        g.fillText(s, x + 6 * k, yy + h + etH / 2); g.textBaseline = 'top';
      }
      g.lineWidth = 1.5 * S; g.strokeStyle = '#141414'; g.strokeRect(x, yy, w, h + etH);
      centros.set(t.id, { x: x + w / 2, y: yy + h / 2 });
    }
    for (const p of estado.puntos) centros.set(p.id, { x: ox + p.x * interior, y: oy + p.y * BH, imaginario: true });

    const gw = GROSORES[e.grosor] * k;
    const dash = TRAZOS[e.trazo] ? TRAZOS[e.trazo].split(' ').map((n) => Number(n) * k) : [];
    g.lineCap = 'round';
    const extremos = new Map();
    for (const [a, b] of estado.lineas) {
      const p = centros.get(a), q = centros.get(b);
      if (!p || !q) continue;
      if (!p.imaginario) extremos.set(a, p);
      if (!q.imaginario) extremos.set(b, q);
      g.setLineDash(dash);
      g.strokeStyle = e.color === '#ffffff' ? 'rgba(20,20,20,.55)' : 'rgba(255,255,255,.85)'; g.lineWidth = gw + 2.2 * k;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      g.strokeStyle = e.color; g.lineWidth = gw;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
    g.setLineDash([]);
    for (const p of extremos.values()) {
      g.beginPath(); g.arc(p.x, p.y, (3 + GROSORES[e.grosor]) * k, 0, Math.PI * 2);
      g.fillStyle = e.color; g.fill(); g.lineWidth = 1.5 * k; g.strokeStyle = e.color === '#ffffff' ? '#141414' : '#fff'; g.stroke();
    }
    for (const p of estado.puntos) {
      g.beginPath(); g.arc(ox + p.x * interior, oy + p.y * BH, 7 * k, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.6 * k; g.strokeStyle = e.color === '#ffffff' ? '#141414' : e.color; g.stroke();
    }
    if (M.pines) {
      const pines = estado.tarjetas.filter((t) => t.pin && centros.has(t.id));
      g.setLineDash([3 * k, 3 * k]); g.lineCap = 'butt';
      for (const t of pines) {
        const c = centros.get(t.id), px = ox + t.pin.x * interior, py = oy + t.pin.y * BH;
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2.6 * k; g.setLineDash([]);
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(px, py); g.stroke();
        g.strokeStyle = '#141414'; g.lineWidth = 1 * k; g.setLineDash([3 * k, 3 * k]);
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(px, py); g.stroke();
      }
      g.setLineDash([]);
      for (const t of pines) {
        const px = ox + t.pin.x * interior, py = oy + t.pin.y * BH, q = 1.5 * k;
        g.save(); g.translate(px - 7 * q, py - 17 * q); g.scale(q, q);
        const forma = new Path2D('M7 17 C7 17 1 10 1 6.5 A6 6 0 0 1 13 6.5 C13 10 7 17 7 17Z');
        g.fillStyle = '#141414'; g.fill(forma); g.lineWidth = 1.2; g.strokeStyle = '#fff'; g.stroke(forma);
        g.beginPath(); g.arc(7, 6.5, 2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
        g.restore();
      }
    }
    g.restore();
    g.lineWidth = 1.5 * S; g.strokeStyle = '#141414'; g.strokeRect(ox + 0.5, oy + 0.5, interior - 1, BH - 1);
    if (conMapa && estado.zona) {
      g.font = `${11 * S}px sans-serif`; g.fillStyle = '#8a8984'; g.textAlign = 'right';
      g.fillText(ATRIB, ox + interior - 8 * S, oy + BH - 18 * S); g.textAlign = 'left';
    }
    y = oy + BH + 56 * S;

    // textos
    g.fillStyle = '#141414'; g.font = `${40 * S}px ${FUENTE}`;
    for (const l of tit) { g.fillText(l, P, y); y += 50 * S; }
    y += 24 * S;
    g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText(`${M.narrativa}:/<`, P, y); y += 30 * S;
    g.font = `${24 * S}px ${FUENTE}`; g.fillStyle = '#141414';
    for (const l of narr) { g.fillText(l, P, y); y += 36 * S; }
    y += 24 * S;
    if (estado.zona) {
      g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('ubicación:/<', P, y); y += 30 * S;
      g.fillStyle = '#141414'; g.fillText(ubicacionTexto(), P, y); y += 40 * S;
    }
    y += 20 * S;
    g.fillStyle = '#141414'; g.fillRect(P, y, interior, 1.5 * S); y += 40 * S;
    g.font = `${20 * S}px ${FUENTE}`;
    g.fillText([v.alias || 'anónimo', v.ciudad, fecha].filter(Boolean).join(' · '), P, y); y += 26 * S;
    g.fillStyle = '#6f6f6c';
    g.fillText(`${LICENCIA} · máquinas_ · ${M.credito}`, P, y); y += 26 * S;
    if (estado.zona) g.fillText(`mapa ${ATRIB}`, P, y);
    return c;
  }

  // pin para la pieza final (con número si la máquina lo pide)
  function dibujarPin(g, px, py, q, n) {
    g.save(); g.translate(px - 7 * q, py - 17 * q); g.scale(q, q);
    const forma = new Path2D('M7 17 C7 17 1 10 1 6.5 A6 6 0 0 1 13 6.5 C13 10 7 17 7 17Z');
    g.fillStyle = '#141414'; g.fill(forma); g.lineWidth = 1.2; g.strokeStyle = '#fff'; g.stroke(forma);
    if (n) { g.fillStyle = '#fff'; g.font = `6px ${FUENTE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 7, 6.8); }
    else { g.beginPath(); g.arc(7, 6.5, 2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); }
    g.restore();
  }

  // pieza de poe_arqui_lecturas: mapa con pines numerados y la secuencia foto + fragmento
  async function componerSecuencia(S = 2, conMapa = true) {
    try { await document.fonts.load(`20px "Share Tech Mono"`); } catch {}
    await esperarImagenes();
    const W = 1400 * S, P = 72 * S, interior = W - P * 2;
    const { W: bw, H: bh } = dims();
    // el mapa se recorta a lo ancho si el tablero era vertical (celular), para que no domine la pieza
    const BHtotal = Math.round(interior * (bh / bw));
    const BH = Math.min(BHtotal, Math.round(interior * 0.62));
    const recorte = (BHtotal - BH) / 2;
    const v = Object.fromEntries(Object.entries(campos).map(([kk, el]) => [kk, el.value.trim()]));
    const fecha = new Date().toISOString().slice(0, 10);
    const fotos = ordenadas();
    const colN = 46 * S, fotoW = Math.round(interior * 0.44), sep = 28 * S, textoW = interior - colN - fotoW - sep;

    const medir = document.createElement('canvas').getContext('2d');
    medir.font = `${40 * S}px ${FUENTE}`; const tit = envolver(medir, v.titulo || 'sin título', interior);
    medir.font = `${26 * S}px ${FUENTE}`;
    const items = fotos.map((t) => {
      const lineas = envolver(medir, (t.fragmento || '').trim() || '—', textoW);
      const fh = fotoW * t.ar;
      return { t, lineas, h: Math.max(fh, lineas.length * 38 * S) };
    });
    let alto = P + 44 * S + 88 * S + tit.length * 50 * S + 32 * S + BH + 56 * S;
    alto += items.reduce((a, it) => a + it.h + 40 * S, 0);
    alto += 40 * S + 60 * S + 26 * S * 3 + P;

    const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(alto);
    const g = c.getContext('2d');
    g.fillStyle = '#f3f2ef'; g.fillRect(0, 0, W, c.height); g.textBaseline = 'top';
    let y = P;
    g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('máquinas_', P, y); y += 44 * S;
    g.font = `${44 * S}px ${FUENTE}`; g.fillStyle = '#141414'; g.fillText(M.titulo, P, y); y += 88 * S;
    g.font = `${40 * S}px ${FUENTE}`;
    for (const l of tit) { g.fillText(l, P, y); y += 50 * S; }
    y += 32 * S;

    // mapa con pines numerados
    const ox = P, oy = y;
    g.fillStyle = '#ffffff'; g.fillRect(ox, oy, interior, BH);
    if (conMapa && estado.zona) {
      const mc = await dibujarMapa(estado.zona, interior, BHtotal);
      g.save(); g.globalAlpha = OPACIDAD_MAPA; g.drawImage(mc, 0, recorte, interior, BH, ox, oy, interior, BH); g.restore();
    }
    g.save(); g.beginPath(); g.rect(ox, oy, interior, BH); g.clip();
    const q = 3.6 * S;
    fotos.forEach((t, i) => {
      if (!t.pin) return;
      const py = Math.min(Math.max(t.pin.y * BHtotal - recorte, 18 * q), BH - 2 * S);
      dibujarPin(g, ox + t.pin.x * interior, oy + py, q, i + 1);
    });
    g.restore();
    g.lineWidth = 1.5 * S; g.strokeStyle = '#141414'; g.strokeRect(ox + 0.5, oy + 0.5, interior - 1, BH - 1);
    if (conMapa && estado.zona) {
      g.font = `${11 * S}px sans-serif`; g.fillStyle = '#8a8984'; g.textAlign = 'right';
      g.fillText(ATRIB, ox + interior - 8 * S, oy + BH - 18 * S); g.textAlign = 'left';
    }
    y = oy + BH + 56 * S;

    // secuencia
    items.forEach((it, i) => {
      const im = imgs.get(it.t.id), fh = fotoW * it.t.ar;
      g.beginPath(); g.arc(P + 15 * S, y + 15 * S, 15 * S, 0, Math.PI * 2); g.fillStyle = '#141414'; g.fill();
      g.fillStyle = '#fff'; g.font = `${16 * S}px ${FUENTE}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), P + 15 * S, y + 16 * S); g.textAlign = 'left'; g.textBaseline = 'top';
      const fx = P + colN;
      if (im && im.naturalWidth) g.drawImage(im, fx, y, fotoW, fh);
      g.lineWidth = 1.5 * S; g.strokeStyle = '#141414'; g.strokeRect(fx, y, fotoW, fh);
      g.fillStyle = '#141414'; g.font = `${26 * S}px ${FUENTE}`;
      let ty = y;
      for (const l of it.lineas) { g.fillText(l, fx + fotoW + sep, ty); ty += 38 * S; }
      y += it.h + 40 * S;
    });

    y += 0;
    g.fillStyle = '#141414'; g.fillRect(P, y, interior, 1.5 * S); y += 40 * S;
    g.font = `${20 * S}px ${FUENTE}`;
    g.fillText([v.alias || 'anónimo', v.ciudad, fecha].filter(Boolean).join(' · '), P, y); y += 26 * S;
    g.fillStyle = '#6f6f6c';
    g.fillText(`${LICENCIA} · máquinas_ · ${M.credito}`, P, y); y += 26 * S;
    if (estado.zona) g.fillText(`mapa ${ATRIB}`, P, y);
    return c;
  }

  // si el mapa no permite exportarse, se compone sin él
  async function componerSeguro(S, tipo, calidad) {
    try { return (await componer(S, true)).toDataURL(tipo, calidad); }
    catch { return (await componer(S, false)).toDataURL(tipo, calidad); }
  }

  let temporizador = null;
  function programarVista() { clearTimeout(temporizador); temporizador = setTimeout(actualizarVista, 500); }
  async function actualizarVista() {
    $('#vista-estado').textContent = 'componiendo pieza_';
    $('#vista').src = await componerSeguro(1, 'image/jpeg', 0.85);
    $('#vista-estado').textContent = '';
  }

  function avisoFinal(txt, error = false) { mensaje.textContent = txt; mensaje.classList.toggle('error', error); }
  const nombreArchivo = () => `${M.id}_${(campos.titulo.value.trim() || 'pieza').replace(/[^\p{L}\p{N}]+/gu, '_').toLowerCase()}`;

  $('#exportar').addEventListener('click', async () => {
    avisoFinal('componiendo pieza en alta resolución_');
    const url = await componerSeguro(2, 'image/png');
    const a = document.createElement('a'); a.href = url; a.download = `${nombreArchivo()}.png`; a.click();
    avisoFinal('png descargado_');
  });

  // ── enviar ────────────────────────────────────────────────────────────
  let widget = null;
  if (CFG.TURNSTILE_SITEKEY) {
    window.onTurnstileLoad = () => { widget = window.turnstile.render('#turnstile', { sitekey: CFG.TURNSTILE_SITEKEY, theme: 'light', language: 'es' }); };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
    s.async = true; document.head.appendChild(s);
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
      if (M.fragmentos) v.narrativa = textoNarrativa();
      const cuerpo = {
        maquina: M.id, ...v, ubicacion: ubicacionTexto(), licencia: LICENCIA, consentimiento: true,
        website: e.target.website.value, turnstile: token,
        tablero: {
          aspecto: +(tablero.clientHeight / tablero.clientWidth).toFixed(4),
          zona: estado.zona && { lat: redondear(estado.zona.lat), lng: redondear(estado.zona.lng), zoom: estado.zona.zoom },
          estilo: estado.estilo,
          tarjetas: estado.tarjetas.map(({ id, x, y, w, ar, label, coords, pin }) => ({
            id, x: +x.toFixed(4), y: +y.toFixed(4), w, ar: +ar.toFixed(4), label, coords,
            ...(pin ? { pin: { x: +pin.x.toFixed(4), y: +pin.y.toFixed(4) } } : {}),
          })),
          puntos: estado.puntos.map(({ id, x, y }) => ({ id, x: +x.toFixed(4), y: +y.toFixed(4) })),
          ...(M.fragmentos ? { orden: ordenadas().map((t) => t.id), fragmentos: ordenadas().map((t) => t.fragmento || '') } : {}),
          lineas: estado.lineas,
        },
      };
      const mandar = (c) => fetch(CFG.WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
      const comoPng = async () => {
        let png = await componerSeguro(1.5, 'image/png');
        if (png.length * 0.75 > 7.5e6) png = await componerSeguro(1, 'image/png');
        return png;
      };
      let r, res;
      if (workerAnterior) {
        const png = await comoPng();
        avisoFinal('2/2 · subiendo tu pieza_ puede tardar un poco con datos móviles.');
        r = await mandar({ ...cuerpo, png });
      } else {
        const imagen = await componerSeguro(2, 'image/jpeg', 0.9);
        avisoFinal('2/2 · subiendo tu pieza_ puede tardar un poco con datos móviles.');
        r = await mandar({ ...cuerpo, imagen });
      }
      res = await r.json().catch(() => ({}));
      // compatibilidad: un Worker anterior solo acepta PNG en el campo «png»
      if (!r.ok && res.error === 'falta la imagen' && !workerAnterior) {
        try { localStorage.setItem('maquinas_worker_png', '1'); } catch {}
        avisoFinal('ajustando el formato_ se envía de nuevo en un momento.');
        const png = await comoPng();
        if (CFG.TURNSTILE_SITEKEY && widget !== null && window.turnstile) {
          window.turnstile.reset(widget);
          cuerpo.turnstile = await new Promise((ok) => {
            const t0 = Date.now();
            const espera = setInterval(() => {
              const tk = window.turnstile.getResponse(widget);
              if (tk || Date.now() - t0 > 20000) { clearInterval(espera); ok(tk || ''); }
            }, 300);
          });
        }
        r = await mandar({ ...cuerpo, png });
        res = await r.json().catch(() => ({}));
      }
      if (r.ok) { try { if (res.ok && !workerAnterior) localStorage.removeItem('maquinas_worker_png'); } catch {} }
      if (!r.ok) throw new Error(res.error || `error ${r.status}`);
      avisoFinal('');
      $('#f-consent').checked = false;
      // la pieza enviada ya no queda para editar: se limpia y se ofrece empezar otra
      reiniciar(true);
      $('#formulario').hidden = true;
      $('.vista').hidden = true;
      $('#exito').hidden = false;
      $('.paso[data-paso="5"]').classList.add('enviado');
      $('#reiniciar').hidden = true;
      $('#anterior').style.visibility = 'hidden';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      avisoFinal(`no se pudo enviar: ${ex.message}. tu pieza sigue aquí; intenta de nuevo.`, true);
    } finally {
      window.removeEventListener('beforeunload', noCerrar);
      boton.disabled = false;
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });

  // ── inicio ────────────────────────────────────────────────────────────
  document.body.classList.toggle('mapa-gris', GRISES);
  fondo.style.opacity = String(OPACIDAD_MAPA);
  $$('.atrib').forEach((el) => { el.textContent = ATRIB; });
  recuperar().then(() => irA(estado.paso || 1));
})();
