// Configuración de envíos. Llena estos dos valores después de crear el Worker y Turnstile (ver README.md).
// Mientras estén vacíos, el tablero funciona y exporta PNG, pero el botón "enviar" avisa que los envíos aún no están activos.
window.MAQUINAS_CONFIG = {
  WORKER_URL: 'https://maquinas-envios.diegogut93.workers.dev',// ej. 'https://maquinas-envios.TU-SUBDOMINIO.workers.dev'
  TURNSTILE_SITEKEY: '0x4AAAAAAF2x2hFO1VH0c_vP', // ej. '0x4AAAAAAA...'
  MAPA_KEY: '',            // clave gratuita de CARTO Basemaps (carto.com/basemaps/apikey). vacía = OpenStreetMap en grises
};
