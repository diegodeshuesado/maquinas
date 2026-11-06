/* máquinas_ · tablero
   Tarjetas arrastrables, líneas rectas tipo constelación, exportación PNG y envío.
   Todo ocurre en el navegador; nada sale hasta que la persona envía. */
(() => {
  'use strict';

  // ── configuración por máquina ─────────────────────────────────────────
  const MAQUINAS = {
    constelaciones_urbanas: {
      titulo: 'máquina_constelaciones_urbanas',
      credito: 'Diego Deshuesado y Daniel Vázquez',
      narrativa: 'mito',
      instructivo: 'constelaciones_urbanas.html',
    },
  };
  const LICENCIA = 'CC BY-NC-SA 4.0';
  const CFG = window.MAQUINAS_CONFIG || {};

  const params = new URLSearchParams(location.search);
  const ID = MAQUINAS[params.get('maquina')] ? params.get('maquina') : 'constelaciones_urbanas';
  const M = MAQUINAS[ID];
  const CLAVE = `maquinas_${ID}`;

  // ── elementos ─────────────────────────────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const tablero = $('#tablero');
  const svg = $('#lineas');
  const vacio = $('#vacio');
  const ayuda = $('#ayuda');
  const form = $('#formulario');
  const mensaje = $('#mensaje');
  const campos = {
    titulo: $('#f-titulo'), narrativa: $('#f-narrativa'), ubicacion: $('#f-ubicacion'),
    alias: $('#f-alias'), ciudad: $('#f-ciudad'),
  };

  $('#titulo-maquina').innerHTML = M.titulo.replace(/_/g, '_<wbr>');
  $('#credito-maquina').textContent = M.credito;
  $('#enlace-instructivo').href = M.instructivo;
  $('#l-narrativa').textContent = `${M.narrativa}:/<`;
  document.title = `${M.titulo} · tablero`;

  // ── estado ────────────────────────────────────────────────────────────
  // tarjeta: { id, src, x, y (fracciones del tablero, esquina sup. izq.), w (fracción del ancho), ar (alto/ancho de la imagen), label }
  let estado = { tarjetas: [], lineas: [] };
  let modo = 'mover';
  let elegida = null;
  const imgs = new Map(); // id → HTMLImageElement (para exportar)

  const AYUDAS = {
    mover: 'mover_ arrastra las fotos. escribe un título en la cédula negra de cada una.',
    conectar: 'conectar_ toca una foto y luego otra para trazar una línea. repite para formar la constelación.',
    borrar: 'borrar_ toca una línea o una foto para quitarla.',
  };

  const uid = () => Math.random().toString(36).slice(2, 9);
  const dims = () => ({ W: tablero.clientWidth, H: tablero.clientHeight });
  const anchoTarjeta = () => (tablero.clientWidth < 500 ? 0.3 : 0.2);

  // ── guardar / recuperar (solo en este navegador) ──────────────────────
  function guardar() {
    const datos = { ...estado, campos: Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value])) };
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); }
    catch { try { localStorage.setItem(CLAVE, JSON.stringify({ ...datos, tarjetas: [], lineas: [] })); } catch {} }
  }
  function recuperar() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (!d) return;
      estado = { tarjetas: d.tarjetas || [], lineas: d.lineas || [] };
      for (const [k, v] of Object.entries(d.campos || {})) if (campos[k]) campos[k].value = v;
    } catch {}
  }

  // ── subir fotos (se reducen antes de usarse) ──────────────────────────
  function reducir(file, max = 1400) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok({ src: c.toDataURL('image/jpeg', 0.85), ar: c.height / c.width });
      };
      im.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen')); };
      im.src = url;
    });
  }

  // «cámara» abre la cámara trasera en el celular; «galería» permite elegir varias fotos
  document.querySelectorAll('.entrada-foto').forEach((entrada) => entrada.addEventListener('change', async (e) => {
    const archivos = [...e.target.files].filter((f) => f.type.startsWith('image/'));
    const w = anchoTarjeta();
    const { W, H } = dims();
    for (const [i, f] of archivos.entries()) {
      try {
        const { src, ar } = await reducir(f);
        const n = estado.tarjetas.length;
        const altoFrac = (w * W * ar) / H;
        estado.tarjetas.push({
          id: uid(), src, ar, w, label: '',
          x: Math.min(0.06 + ((n * 0.17) % 0.7), 1 - w),
          y: Math.min(0.06 + ((n * 0.11) % 0.6) + (i % 2) * 0.05, Math.max(0, 1 - altoFrac)),
        });
      } catch { aviso('no se pudo leer una de las imágenes.', true); }
    }
    e.target.value = '';
    pintar(); guardar();
  }));

  // ── pintar ────────────────────────────────────────────────────────────
  function pintar() {
    tablero.querySelectorAll('.tarjeta').forEach((n) => n.remove());
    vacio.style.display = estado.tarjetas.length ? 'none' : '';
    const { W } = dims();
    for (const t of estado.tarjetas) {
      const el = document.createElement('div');
      el.className = 'tarjeta' + (elegida === t.id ? ' elegida' : '');
      el.dataset.id = t.id;
      el.style.left = `${t.x * 100}%`;
      el.style.top = `${t.y * 100}%`;
      el.style.width = `${t.w * W}px`;
      const img = document.createElement('img');
      img.src = t.src; img.alt = t.label || 'foto de la constelación'; img.draggable = false;
      const inp = document.createElement('input');
      inp.value = t.label; inp.maxLength = 40; inp.placeholder = 'título_';
      inp.setAttribute('aria-label', 'título de esta foto');
      inp.addEventListener('input', () => { t.label = inp.value; img.alt = inp.value || 'foto'; guardar(); });
      inp.addEventListener('pointerdown', (ev) => { if (modo === 'mover') ev.stopPropagation(); });
      inp.readOnly = modo !== 'mover';
      el.append(img, inp);
      tablero.appendChild(el);
      if (!imgs.has(t.id)) { const im = new Image(); im.src = t.src; imgs.set(t.id, im); }
    }
    trazar();
  }

  function centro(t) {
    const el = tablero.querySelector(`.tarjeta[data-id="${t.id}"]`);
    const { W, H } = dims();
    const img = el && el.querySelector('img');
    const w = t.w * W;
    const h = img && img.offsetHeight ? img.offsetHeight : w * t.ar;
    return { x: t.x * W + w / 2, y: t.y * H + h / 2 };
  }

  function trazar() {
    const { W, H } = dims();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const porId = new Map(estado.tarjetas.map((t) => [t.id, t]));
    estado.lineas = estado.lineas.filter(([a, b]) => porId.has(a) && porId.has(b));
    let html = '';
    const puntos = new Map();
    estado.lineas.forEach(([a, b], i) => {
      const p = centro(porId.get(a)), q = centro(porId.get(b));
      puntos.set(a, p); puntos.set(b, q);
      html += `<g data-i="${i}">
        <line class="toque" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>
        <line class="halo" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>
        <line class="trazo" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/></g>`;
    });
    for (const p of puntos.values()) html += `<circle cx="${p.x}" cy="${p.y}" r="4.5"/>`;
    svg.innerHTML = html;
    svg.querySelectorAll('line.toque').forEach((ln) => {
      ln.style.pointerEvents = modo === 'borrar' ? 'stroke' : 'none';
      ln.addEventListener('click', () => {
        estado.lineas.splice(Number(ln.parentNode.dataset.i), 1);
        trazar(); guardar();
      });
    });
  }

  // ── modos ─────────────────────────────────────────────────────────────
  function cambiarModo(m) {
    modo = m; elegida = null;
    document.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
    tablero.className = `tablero modo-${m}`;
    ayuda.textContent = AYUDAS[m];
    pintar();
  }
  document.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => cambiarModo(b.dataset.modo)));

  // ── arrastrar / conectar / borrar ─────────────────────────────────────
  let arrastre = null;
  tablero.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.tarjeta');
    if (!el) { if (modo === 'conectar' && elegida) { elegida = null; pintar(); } return; }
    const t = estado.tarjetas.find((x) => x.id === el.dataset.id);
    if (!t) return;
    e.preventDefault();

    if (modo === 'borrar') {
      estado.tarjetas = estado.tarjetas.filter((x) => x.id !== t.id);
      imgs.delete(t.id);
      pintar(); guardar(); return;
    }
    if (modo === 'conectar') {
      if (!elegida) { elegida = t.id; pintar(); return; }
      if (elegida !== t.id) {
        const ya = estado.lineas.some(([a, b]) => (a === elegida && b === t.id) || (a === t.id && b === elegida));
        if (!ya) estado.lineas.push([elegida, t.id]);
        // la foto recién tocada queda elegida para seguir trazando en cadena
        elegida = t.id; guardar();
      } else { elegida = null; }
      pintar(); return;
    }
    // mover: traer al frente
    estado.tarjetas = estado.tarjetas.filter((x) => x !== t).concat(t);
    const r = tablero.getBoundingClientRect();
    arrastre = { t, el, dx: e.clientX - r.left - t.x * r.width, dy: e.clientY - r.top - t.y * r.height };
    tablero.appendChild(el);
    el.classList.add('arrastrando');
    el.setPointerCapture(e.pointerId);
  });

  tablero.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const r = tablero.getBoundingClientRect();
    const { t, el } = arrastre;
    const wf = t.w, hf = el.offsetHeight / r.height;
    t.x = Math.min(Math.max((e.clientX - r.left - arrastre.dx) / r.width, 0), 1 - wf);
    t.y = Math.min(Math.max((e.clientY - r.top - arrastre.dy) / r.height, 0), Math.max(0, 1 - hf));
    el.style.left = `${t.x * 100}%`;
    el.style.top = `${t.y * 100}%`;
    trazar();
  });
  const soltar = () => { if (arrastre) { arrastre.el.classList.remove('arrastrando'); arrastre = null; guardar(); } };
  tablero.addEventListener('pointerup', soltar);
  tablero.addEventListener('pointercancel', soltar);

  new ResizeObserver(() => pintar()).observe(tablero);

  $('#limpiar').addEventListener('click', () => {
    if (!estado.tarjetas.length || confirm('¿borrar todas las fotos y líneas del tablero?')) {
      estado = { tarjetas: [], lineas: [] }; imgs.clear(); pintar(); guardar();
    }
  });
  Object.values(campos).forEach((el) => el.addEventListener('input', guardar));

  // ── exportar PNG ──────────────────────────────────────────────────────
  const FUENTE = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';

  function envolver(ctx, texto, ancho) {
    const lineas = [];
    for (const parrafo of String(texto).split(/\n/)) {
      if (!parrafo.trim()) { lineas.push(''); continue; }
      let actual = '';
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = palabra; }
        else actual = prueba;
      }
      lineas.push(actual);
    }
    return lineas;
  }

  async function esperarImagenes() {
    await Promise.all(estado.tarjetas.map((t) => {
      let im = imgs.get(t.id);
      if (!im) { im = new Image(); im.src = t.src; imgs.set(t.id, im); }
      return im.complete && im.naturalWidth ? null : new Promise((ok) => { im.onload = im.onerror = ok; });
    }));
  }

  async function componer() {
    try { await document.fonts.load(`20px "Share Tech Mono"`); } catch {}
    await esperarImagenes();

    const W = 1400, P = 72, interior = W - P * 2;
    const { W: bw, H: bh } = dims();
    const esc = interior / bw;
    // grosor de líneas, puntos y cédulas: igual en celular y escritorio
    const k = Math.min(esc, 1.6);
    const BH = Math.round(bh * esc);
    const v = Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value.trim()]));
    const fecha = new Date().toISOString().slice(0, 10);

    const medir = document.createElement('canvas').getContext('2d');
    medir.font = `24px ${FUENTE}`;
    const narr = envolver(medir, v.narrativa || '—', interior);
    const tit = (() => { medir.font = `40px ${FUENTE}`; return envolver(medir, v.titulo || 'sin título', interior); })();

    // alto total
    let alto = P + 26 + 18 + 48 + 40 + BH + 56 + tit.length * 50 + 24 + 30 + narr.length * 36 + 24;
    if (v.ubicacion) alto += 70;
    alto += 60 + 26 + 26 + P;

    const c = document.createElement('canvas');
    c.width = W; c.height = Math.ceil(alto);
    const g = c.getContext('2d');
    g.fillStyle = '#f3f2ef'; g.fillRect(0, 0, W, c.height);
    g.textBaseline = 'top';
    g.fillStyle = '#141414';

    let y = P;
    g.font = `22px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('máquinas_', P, y); y += 26 + 18;
    g.font = `44px ${FUENTE}`; g.fillStyle = '#141414'; g.fillText(M.titulo, P, y); y += 48 + 40;

    // tablero
    const ox = P, oy = y;
    g.fillStyle = '#ffffff'; g.fillRect(ox, oy, interior, BH);
    g.lineWidth = 1.5; g.strokeStyle = '#141414'; g.strokeRect(ox + 0.5, oy + 0.5, interior - 1, BH - 1);
    g.save(); g.beginPath(); g.rect(ox, oy, interior, BH); g.clip();

    const centros = new Map();
    const etH = 22 * k;
    for (const t of estado.tarjetas) {
      const im = imgs.get(t.id);
      const x = ox + t.x * interior, yy = oy + t.y * BH;
      const w = t.w * interior, h = w * t.ar;
      g.fillStyle = '#fff'; g.fillRect(x, yy, w, h + etH);
      if (im && im.naturalWidth) g.drawImage(im, x, yy, w, h);
      g.fillStyle = '#141414'; g.fillRect(x, yy + h, w, etH);
      if (t.label) {
        g.fillStyle = '#f3f2ef'; g.font = `${Math.round(12 * k)}px ${FUENTE}`; g.textBaseline = 'middle';
        let s = t.label; while (s && g.measureText(s).width > w - 12 * k) s = s.slice(0, -1);
        g.fillText(s, x + 6 * k, yy + h + etH / 2); g.textBaseline = 'top';
      }
      g.lineWidth = 1.5; g.strokeStyle = '#141414'; g.strokeRect(x, yy, w, h + etH);
      centros.set(t.id, { x: x + w / 2, y: yy + h / 2 });
    }
    const usados = new Map();
    for (const [a, b] of estado.lineas) {
      const p = centros.get(a), q = centros.get(b);
      if (!p || !q) continue;
      usados.set(a, p); usados.set(b, q);
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3.4 * k;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      g.strokeStyle = '#141414'; g.lineWidth = 1.4 * k;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
    for (const p of usados.values()) {
      g.beginPath(); g.arc(p.x, p.y, 4.5 * k, 0, Math.PI * 2);
      g.fillStyle = '#141414'; g.fill(); g.lineWidth = 1.5 * k; g.strokeStyle = '#fff'; g.stroke();
    }
    g.restore();
    y = oy + BH + 56;

    // textos
    g.fillStyle = '#141414';
    g.font = `40px ${FUENTE}`;
    for (const l of tit) { g.fillText(l, P, y); y += 50; }
    y += 24;
    g.font = `22px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText(`${M.narrativa}:/<`, P, y); y += 30;
    g.font = `24px ${FUENTE}`; g.fillStyle = '#141414';
    for (const l of narr) { g.fillText(l, P, y); y += 36; }
    y += 24;
    if (v.ubicacion) {
      g.font = `22px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('ubicación:/<', P, y); y += 30;
      g.fillStyle = '#141414'; g.fillText(v.ubicacion, P, y); y += 40;
    }
    y += 20;
    g.fillStyle = '#141414'; g.fillRect(P, y, interior, 1.5); y += 40;
    g.font = `20px ${FUENTE}`; g.fillStyle = '#141414';
    g.fillText([v.alias || 'anónimo', v.ciudad, fecha].filter(Boolean).join(' · '), P, y); y += 26;
    g.fillStyle = '#6f6f6c';
    g.fillText(`${LICENCIA} · máquinas_ · ${M.credito}`, P, y);
    return c;
  }

  function aviso(txt, error = false) { mensaje.textContent = txt; mensaje.classList.toggle('error', error); }

  function validar() {
    if (!estado.tarjetas.length) return 'sube al menos una foto al tablero.';
    if (!campos.titulo.value.trim()) return 'falta el título.';
    if (!campos.narrativa.value.trim()) return `falta el ${M.narrativa}.`;
    return null;
  }

  $('#exportar').addEventListener('click', async () => {
    const err = validar(); if (err) return aviso(err, true);
    aviso('componiendo pieza_');
    const c = await componer();
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${ID}_${(campos.titulo.value.trim() || 'pieza').replace(/[^\p{L}\p{N}]+/gu, '_').toLowerCase()}.png`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      aviso('png descargado_');
    }, 'image/png');
  });

  // ── enviar ────────────────────────────────────────────────────────────
  let widget = null;
  if (CFG.TURNSTILE_SITEKEY) {
    window.onTurnstileLoad = () => { widget = window.turnstile.render('#turnstile', { sitekey: CFG.TURNSTILE_SITEKEY, theme: 'light', language: 'es' }); };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
    s.async = true; document.head.appendChild(s);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = validar(); if (err) return aviso(err, true);
    if (!$('#f-consent').checked) return aviso('para enviar, marca la casilla de licencia.', true);
    if (!CFG.WORKER_URL) return aviso('los envíos aún no están activos. puedes descargar tu png mientras tanto.', true);
    let token = '';
    if (CFG.TURNSTILE_SITEKEY) {
      token = window.turnstile && widget !== null ? window.turnstile.getResponse(widget) : '';
      if (!token) return aviso('espera a que termine la verificación de abajo.', true);
    }
    const boton = $('#enviar'); boton.disabled = true;
    aviso('componiendo y enviando pieza_');
    try {
      const c = await componer();
      const png = c.toDataURL('image/png');
      const v = Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value.trim()]));
      const cuerpo = {
        maquina: ID, ...v, licencia: LICENCIA, consentimiento: true,
        website: form.website.value, turnstile: token, png,
        tablero: {
          aspecto: +(tablero.clientHeight / tablero.clientWidth).toFixed(4),
          tarjetas: estado.tarjetas.map(({ id, x, y, w, ar, label }) => ({ id, x: +x.toFixed(4), y: +y.toFixed(4), w, ar: +ar.toFixed(4), label })),
          lineas: estado.lineas,
        },
      };
      const r = await fetch(CFG.WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || `error ${r.status}`);
      aviso('envío recibido_ gracias. tu pieza aparecerá en la galería cuando sea aprobada.');
      $('#f-consent').checked = false;
    } catch (ex) {
      aviso(`no se pudo enviar: ${ex.message}. intenta de nuevo.`, true);
    } finally {
      boton.disabled = false;
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });

  // ── inicio ────────────────────────────────────────────────────────────
  recuperar();
  cambiarModo('mover');
})();
