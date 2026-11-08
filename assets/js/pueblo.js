/* máquinas_ · un_pueblo_feliz
   3 pasos: cifra real (al azar o elegida) → selfie con la cifra como filtro → revisar y enviar.
   Las cifras vienen de datos/cifras.json (se actualiza solo cada semana desde el SESNSP + cifras_manual.json). */
(() => {
  'use strict';

  const M = { id: 'un_pueblo_feliz', titulo: 'máquina_un_pueblo_feliz', credito: 'Diego Deshuesado' };
  const LICENCIA = 'CC BY-NC-SA 4.0';
  const CFG = window.MAQUINAS_CONFIG || {};
  const CLAVE = 'maquinas_un_pueblo_feliz_v1';
  const TOTAL = 3;
  const AR = 5 / 4;                 // alto/ancho de la selfie (4:5)
  const CENTRO = 0.70;              // el estiquer va un poco abajo, no hasta abajo
  const FUENTE = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';

  let cifras = [];
  let estado = { paso: 1, cifra: null, foto: null };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const aviso = $('#aviso'), mensaje = $('#mensaje');
  const cifra = () => cifras.find((c) => c.id === estado.cifra) || cifras[0];

  // ── guardar (la foto va a IndexedDB) ──────────────────────────────────
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
  let fotoImg = null;
  const guardar = () => { aviso.textContent = ''; try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch {} };
  const cargarImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });

  // ── el estiquer: banda de lado a lado, fondo negro, letras blancas ────
  function envolver(g, texto, ancho) {
    const out = []; let a = '';
    for (const p of String(texto).split(/\s+/)) { const t = a ? `${a} ${p}` : p; if (g.measureText(t).width > ancho && a) { out.push(a); a = p; } else a = t; }
    if (a) out.push(a);
    return out;
  }
  // devuelve el alto de la banda; si dibujar=false solo mide
  function estiquer(g, w, c, y, dibujar = true) {
    const pad = w * 0.05, ancho = w - pad * 2;
    let tn = w * 0.13;
    g.font = `${tn}px ${FUENTE}`;
    while (g.measureText(c.numero).width > ancho && tn > w * 0.05) { tn *= 0.92; g.font = `${tn}px ${FUENTE}`; }
    const te = w * 0.042, tf = w * 0.024, te2 = w * 0.026;
    g.font = `${te}px ${FUENTE}`; const lineas = envolver(g, c.texto, ancho);
    g.font = `${tf}px ${FUENTE}`; const fuente = envolver(g, `fuente: ${c.fuente} · ${c.tipo} · ${c.periodo}`, ancho);
    const alto = pad * 0.8 + te2 * 1.5 + tn * 1.05 + lineas.length * te * 1.25 + w * 0.02 + fuente.length * tf * 1.35 + pad * 0.7;
    if (!dibujar) return alto;
    g.save(); g.textBaseline = 'top';
    g.fillStyle = '#141414'; g.fillRect(0, y, w, alto);
    let yy = y + pad * 0.8;
    g.font = `${te2}px ${FUENTE}`; g.fillStyle = '#9a9a96'; g.fillText('un_pueblo_feliz:/<', pad, yy); yy += te2 * 1.5;
    g.font = `${tn}px ${FUENTE}`; g.fillStyle = '#ffffff'; g.fillText(c.numero, pad - tn * 0.03, yy); yy += tn * 1.05;
    g.font = `${te}px ${FUENTE}`; for (const l of lineas) { g.fillText(l, pad, yy); yy += te * 1.25; }
    yy += w * 0.02;
    g.font = `${tf}px ${FUENTE}`; g.fillStyle = '#9a9a96'; for (const l of fuente) { g.fillText(l, pad, yy); yy += tf * 1.35; }
    g.restore();
    return alto;
  }
  // posición: centrado al 70 % de la altura, sin salirse de abajo
  function yEstiquer(g, w, h, c) {
    const alto = estiquer(g, w, c, 0, false);
    return Math.max(0, Math.min(h * CENTRO - alto / 2, h * 0.97 - alto));
  }
  function pintarEstiquer(canvas, conFondo) {
    const c = cifra(); if (!c) return;
    const w = canvas.clientWidth; if (!w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (conFondo) {
      const alto = estiquer(canvas.getContext('2d'), w, c, 0, false);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(alto * dpr); canvas.style.height = `${alto}px`;
      const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); estiquer(g, w, c, 0);
      return;
    }
    const h = w * AR;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    estiquer(g, w, c, yEstiquer(g, w, h, c));
  }

  // ── paso 1: la cifra ──────────────────────────────────────────────────
  function pintarCifra() {
    const c = cifra(); if (!c) return;
    pintarEstiquer($('#estiquer-vista'), true);
    $('#cifra-fuente').innerHTML = '';
    const a = document.createElement('a'); a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'ver fuente_';
    $('#cifra-fuente').append(`${c.tipo === 'oficial' ? 'cifra oficial' : 'cifra de sociedad civil'} · `, a);
    $$('.cifra-op').forEach((b) => b.classList.toggle('on', b.dataset.id === c.id));
  }
  function azar() {
    const otras = cifras.filter((c) => c.id !== estado.cifra);
    estado.cifra = (otras[Math.floor(Math.random() * otras.length)] || cifras[0]).id;
    guardar(); pintarCifra();
  }
  $('#cifra-azar').addEventListener('click', azar);
  function pintarLista() {
    const caja = $('#cifra-lista'); caja.innerHTML = '';
    cifras.forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cifra-op'; b.dataset.id = c.id;
      b.innerHTML = '<strong></strong><span></span><em></em>';
      b.querySelector('strong').textContent = c.numero;
      b.querySelector('span').textContent = c.texto;
      b.querySelector('em').textContent = `${c.fuente} · ${c.tipo}`;
      b.addEventListener('click', () => { estado.cifra = c.id; guardar(); pintarCifra(); $('#estiquer-vista').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      caja.appendChild(b);
    });
  }

  // ── paso 2: la selfie con filtro ──────────────────────────────────────
  const video = $('#video'), filtro = $('#filtro'), foto = $('#foto');
  let flujo = null;
  function apagar() { if (flujo) { flujo.getTracks().forEach((t) => t.stop()); flujo = null; } video.srcObject = null; }
  async function encender() {
    $('#camara-estado').textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { sinCamara('tu navegador no abre la cámara aquí; usa «subir foto».'); return; }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } }, audio: false });
      video.srcObject = flujo; await video.play();
      modoSelfie('vivo');
    } catch (e) {
      sinCamara(e && e.name === 'NotAllowedError' ? 'no se dio permiso de cámara; puedes usar «subir foto».' : 'no se pudo abrir la cámara; puedes usar «subir foto».');
    }
  }
  function sinCamara(t) { apagar(); modoSelfie(estado.foto ? 'foto' : 'nada'); $('#camara-estado').textContent = t; }
  function modoSelfie(m) {
    video.hidden = m !== 'vivo'; foto.hidden = m !== 'foto';
    $('#selfie-vacia').hidden = m !== 'nada';
    $('#tomar').hidden = m !== 'vivo';
    $('#otra').hidden = m !== 'foto';
    $('#abrir').hidden = m !== 'nada';
    requestAnimationFrame(() => pintarEstiquer(filtro, false));
  }
  // recorta al centro en 4:5; espejo=true deja la foto como se vio en la pantalla
  function recortar(fuente, fw, fh, espejo) {
    const W = 1080, H = Math.round(W * AR), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), k = Math.max(W / fw, H / fh), dw = fw * k, dh = fh * k;
    if (espejo) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(fuente, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return c.toDataURL('image/jpeg', 0.9);
  }
  async function ponerFoto(src) {
    if (estado.foto) db.quitar(estado.foto);
    const id = Math.random().toString(36).slice(2, 9);
    await db.poner(id, src); estado.foto = id; fotoImg = await cargarImg(src);
    foto.src = src; guardar(); modoSelfie('foto');
  }
  $('#tomar').addEventListener('click', async () => {
    if (!video.videoWidth) return;
    const src = recortar(video, video.videoWidth, video.videoHeight, true);
    apagar(); await ponerFoto(src);
  });
  $('#otra').addEventListener('click', encender);
  $('#abrir').addEventListener('click', encender);
  $('#subir').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const url = URL.createObjectURL(f), im = await cargarImg(url);
    if (!im) { aviso.textContent = 'no se pudo leer la foto.'; return; }
    apagar(); await ponerFoto(recortar(im, im.naturalWidth, im.naturalHeight, false)); URL.revokeObjectURL(url);
  });
  new ResizeObserver(() => { if (estado.paso === 2) pintarEstiquer(filtro, false); if (estado.paso === 1) pintarCifra(); }).observe($('.envoltura'));

  // ── la pieza ──────────────────────────────────────────────────────────
  async function componer(S = 2) {
    try { await document.fonts.load('20px "Share Tech Mono"'); } catch {}
    const W = 1400 * S, P = 72 * S, I = W - P * 2, HF = Math.round(I * AR);
    const c = document.createElement('canvas'); c.width = W; c.height = P + 44 * S + 88 * S + HF + 50 * S + 26 * S + P;
    const g = c.getContext('2d'); g.fillStyle = '#f3f2ef'; g.fillRect(0, 0, W, c.height); g.textBaseline = 'top';
    let y = P;
    g.font = `${22 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText('máquinas_', P, y); y += 44 * S;
    g.font = `${44 * S}px ${FUENTE}`; g.fillStyle = '#141414'; g.fillText(M.titulo, P, y); y += 88 * S;
    // selfie + estiquer (en un lienzo aparte para que la banda vaya de lado a lado de la foto)
    const f = document.createElement('canvas'); f.width = I; f.height = HF;
    const fg = f.getContext('2d');
    if (fotoImg) fg.drawImage(fotoImg, 0, 0, I, HF);
    estiquer(fg, I, cifra(), yEstiquer(fg, I, HF, cifra()));
    g.drawImage(f, P, y); g.lineWidth = 1.5 * S; g.strokeStyle = '#141414'; g.strokeRect(P + 0.5, y + 0.5, I - 1, HF - 1);
    y += HF + 50 * S;
    g.font = `${20 * S}px ${FUENTE}`; g.fillStyle = '#6f6f6c'; g.fillText(`${LICENCIA} · máquinas_ · ${M.credito}`, P, y);
    return c;
  }

  // ── pasos ─────────────────────────────────────────────────────────────
  function validar(paso) {
    if (paso === 1 && !cifra()) return 'las cifras no cargaron; revisa tu conexión y recarga la página.';
    if (paso === 2 && !fotoImg) return 'tómate la selfie (o súbela) para continuar.';
    return null;
  }
  function reiniciar() {
    if (estado.foto) db.quitar(estado.foto);
    estado = { paso: 1, cifra: null, foto: null }; fotoImg = null; foto.removeAttribute('src'); $('#vista').removeAttribute('src');
    azar();
  }
  $('#reiniciar').addEventListener('click', () => { if (confirm('¿borrar esta selfie y empezar de nuevo?')) { reiniciar(); irA(1); } });
  $('#nueva').addEventListener('click', () => irA(1));

  async function irA(paso) {
    if (paso !== 2) apagar();
    estado.paso = paso;
    $$('.paso').forEach((s) => { s.hidden = Number(s.dataset.paso) !== paso; });
    $('#progreso').textContent = `${'■'.repeat(paso)}${'□'.repeat(TOTAL - paso)} ${paso}/${TOTAL}`;
    $('#reiniciar').hidden = !estado.foto;
    $('#exito').hidden = true; $(`.paso[data-paso="${TOTAL}"]`).classList.remove('enviado');
    $('#formulario').hidden = false; $('.vista').hidden = false;
    $('#anterior').style.visibility = paso > 1 ? 'visible' : 'hidden';
    $('#siguiente').style.display = paso === TOTAL ? 'none' : '';
    aviso.textContent = '';
    if (paso === 1) requestAnimationFrame(pintarCifra);
    if (paso === 2) { if (fotoImg) { foto.src = fotoImg.src; modoSelfie('foto'); } else encender(); }
    if (paso === TOTAL) { $('#vista-estado').textContent = 'componiendo pieza_'; $('#vista').src = (await componer(1)).toDataURL('image/jpeg', 0.85); $('#vista-estado').textContent = ''; }
    guardar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#siguiente').addEventListener('click', () => { const e = validar(estado.paso); if (e) { aviso.textContent = e; return; } irA(Math.min(TOTAL, estado.paso + 1)); });
  $('#anterior').addEventListener('click', () => irA(Math.max(1, estado.paso - 1)));
  function avisoFinal(t, error = false) { mensaje.textContent = t; mensaje.classList.toggle('error', error); }
  $('#exportar').addEventListener('click', async () => {
    avisoFinal('componiendo pieza en alta resolución_');
    const a = document.createElement('a'); a.href = (await componer(2)).toDataURL('image/png'); a.download = `${M.id}_${cifra().id}.png`; a.click();
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
    for (const p of [1, 2]) { const err = validar(p); if (err) return avisoFinal(err, true); }
    if (!$('#f-consent').checked) return avisoFinal('para enviar, marca la casilla de consentimiento.', true);
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
      const c = cifra();
      const cuerpo = {
        maquina: M.id, titulo: `${c.numero} ${c.texto}`.slice(0, 80), narrativa: `${c.numero} ${c.texto}. fuente: ${c.fuente} (${c.tipo}, ${c.periodo}).`,
        alias: '', ciudad: '', ubicacion: '', licencia: LICENCIA, consentimiento: true,
        website: e.target.website.value, turnstile: token,
        tablero: { cifra: c.id, numero: c.numero, texto: c.texto, fuente: c.fuente, tipo: c.tipo, periodo: c.periodo, url: c.url },
      };
      const mandar = (b) => fetch(CFG.WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
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
      reiniciar();
      try { if (window.gtag) gtag('event', 'pieza_enviada', { maquina: M.id }); } catch {}
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

  // ── inicio ────────────────────────────────────────────────────────────
  (async () => {
    try { estado = { ...estado, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }; } catch {}
    try {
      const r = await fetch(`datos/cifras.json?${Date.now()}`, { cache: 'no-store' });
      cifras = (await r.json()).cifras || [];
    } catch { aviso.textContent = 'las cifras no cargaron; revisa tu conexión y recarga la página.'; }
    if (estado.foto) { const src = await db.leer(estado.foto); if (src) fotoImg = await cargarImg(src); else estado.foto = null; }
    pintarLista();
    if (!cifras.some((c) => c.id === estado.cifra)) azar();
    try { await document.fonts.load('20px "Share Tech Mono"'); } catch {}
    irA(estado.paso || 1);
  })();
})();
