# máquinas_

Instructivos participativos de Diego Deshuesado. Sitio estático en GitHub Pages con un tablero donde cada persona arma su pieza (fotos, líneas, título y narrativa), la exporta en PNG y la envía. Cada envío llega como **Pull Request**: **Merge** = aprobado y publicado en la galería, **Close** = rechazado.

Las personas **no necesitan cuenta de GitHub**.

```
index.html                  inicio con las seis carpetas
constelaciones_urbanas.html instructivo
tablero.html                constelaciones_urbanas: zona (mapa) → luces → constelación → mito → enviar
ficciones_de_mi_barrio.html instructivo
tablero_ficciones.html      ficciones_de_mi_barrio: colonia → fotos → pines en el mapa → historia → enviar
poe_arqui_lecturas.html     instructivo
tablero_poe.html            poe_arqui_lecturas: zona → poesía (buscador Wikisource) → fotos con pines numerados → fragmentos en orden → enviar
galeria.html                piezas aprobadas
config.js                   ← aquí pegas la URL del Worker y la clave de Turnstile
assets/                     estilos, script del tablero, fotos de la expo
envios/                     cada pieza aprobada vive en envios/<id>/ (pieza.png + datos.json)
scripts/indice.mjs          genera envios/index.json para la galería
.github/workflows/          publica el sitio en cada cambio de main
worker/worker.js            recibe envíos y crea el Pull Request (Cloudflare)
```

---

## Instalación (una sola vez, ~30 min)

### 1. Repositorio y GitHub Pages
1. En GitHub crea un repositorio **público** llamado `maquinas`.
2. Sube todo el contenido de esta carpeta (arrastrando los archivos en «Add file → Upload files» o con git). Asegúrate de que se suba la carpeta oculta `.github`.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. En la pestaña **Actions** espera a que «publicar sitio» termine en verde. Tu sitio queda en `https://TU_USUARIO.github.io/maquinas/`.

En este punto el tablero ya funciona y descarga PNG; falta activar los envíos.

### 2. Token de GitHub (la llave del Worker)
**Settings de tu cuenta → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
- Repository access: **Only select repositories → maquinas**
- Permissions: **Contents: Read and write** y **Pull requests: Read and write**
- Copia el token (empieza con `github_pat_`). Anota su fecha de vencimiento para renovarlo.

### 3. Turnstile (antispam de Cloudflare)
1. Crea una cuenta gratis en Cloudflare.
2. **Turnstile → Add widget** · Hostname: `TU_USUARIO.github.io` · Mode: Managed.
3. Copia la **Site key** (pública) y la **Secret key** (privada).

### 4. Worker
1. En Cloudflare: **Workers & Pages → Create → Worker**, nómbralo `maquinas-envios` → Deploy.
2. **Edit code**: borra todo, pega el contenido de `worker/worker.js` → Deploy.
3. **Settings → Variables and Secrets**, agrega:

| nombre | tipo | valor |
|---|---|---|
| `GITHUB_OWNER` | Text | tu usuario de GitHub |
| `GITHUB_REPO` | Text | `maquinas` |
| `GITHUB_BRANCH` | Text | `main` |
| `ALLOWED_ORIGIN` | Text | `https://TU_USUARIO.github.io` |
| `GITHUB_TOKEN` | **Secret** | el token del paso 2 |
| `TURNSTILE_SECRET` | **Secret** | la Secret key del paso 3 |

4. Copia la URL del Worker (algo como `https://maquinas-envios.TU-SUBDOMINIO.workers.dev`).

### 5. Conectar el sitio
Edita `config.js` en GitHub (ícono de lápiz) y llena:
```js
WORKER_URL: 'https://maquinas-envios.TU-SUBDOMINIO.workers.dev',
TURNSTILE_SITEKEY: '0x4AAAA...',
```
Commit → el sitio se vuelve a publicar solo.

### 6. Prueba
Abre el tablero, sube 2–3 fotos, conéctalas, llena título y mito, marca la licencia y envía. En **Pull requests** de tu repositorio debe aparecer `envío: constelaciones_urbanas — …`.

---

## Mapa
El mapa usa CARTO Positron (datos de OpenStreetMap) con Leaflet. Es gratuito y sin clave; el crédito «© OpenStreetMap © CARTO» aparece en el tablero y en cada pieza.

## Actualizar el Worker
Cada vez que cambie `worker/worker.js`, vuelve a pegarlo en Cloudflare: **Workers & Pages → maquinas-envios → Edit code → pegar → Deploy**. Las variables no se tocan.

## Moderar envíos
- Te llega aviso de GitHub (correo o app de GitHub en el celular).
- Abre el Pull Request: ves la pieza, el título, la narrativa y el alias.
- **Merge pull request** → aprobado; en ~1 minuto aparece en la galería.
- **Close pull request** → rechazado; no se publica.

> Como el repositorio es público, los envíos pendientes también se pueden ver en la pestaña Pull requests (decisión tomada: opción A).

## Editar textos
- Introducción: `index.html`, bloque marcado `EDITA AQUÍ`.
- Instructivo: `constelaciones_urbanas.html`.
- Operaciones de las seis carpetas: lista `MAQUINAS` al final de `index.html`.

## Agregar otra máquina al tablero
1. Copia un instructivo (`<id>.html`) y un tablero (`tablero_<id>.html`) y cambia los textos; el tablero lleva `<body data-maquina="<id>">`.
2. En `assets/js/tablero.js`, agrega su entrada en `MAQUINAS` (textos, mínimo, líneas o pines, opacidad del mapa).
3. En `index.html` marca la carpeta con `activa: true`, y en `galeria.html` agrega su `instructivo`.

## Licencia de las piezas
Las piezas participantes se publican bajo [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es), aceptada por cada persona al enviar.
