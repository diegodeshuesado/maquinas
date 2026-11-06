// Configuración de envíos. Llena estos dos valores después de crear el Worker y Turnstile (ver README.md).
// Mientras estén vacíos, el tablero funciona y exporta PNG, pero el botón "enviar" avisa que los envíos aún no están activos.
window.MAQUINAS_CONFIG = {
  WORKER_URL: '',          // ej. 'https://maquinas-envios.TU-SUBDOMINIO.workers.dev'
  TURNSTILE_SITEKEY: '',   // ej. '0x4AAAAAAA...'
};
