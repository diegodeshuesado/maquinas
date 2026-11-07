"""Actualiza datos/cifras.json para la máquina un_pueblo_feliz.

1. Descarga del SESNSP (datos abiertos, nueva metodología) la base estatal de víctimas del fuero común
   del año más reciente y calcula cifras nacionales del último mes publicado.
2. Le suma las cifras de datos/cifras_manual.json (fuentes sin archivo descargable: INEGI, registro de
   personas desaparecidas, organizaciones civiles). Ese archivo se edita a mano.

Si la descarga falla, conserva las cifras automáticas que ya estaban en datos/cifras.json.
Uso: python scripts/cifras.py [archivo.csv|archivo.zip]   (el archivo local sirve para probar sin red)
"""
import csv, io, json, re, sys, urllib.request, zipfile, calendar, html
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'datos' / 'cifras.json'
MANUAL = RAIZ / 'datos' / 'cifras_manual.json'
PAGINAS = [
    'https://www.gob.mx/sesnsp/articulos/nueva-metodologia-para-el-registro-y-clasificacion-de-los-delitos-y-las-victimas-para-fines-estadisticos?state=published',
    'https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva',
]
FUENTE_URL = PAGINAS[1]
MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
UA = {'User-Agent': 'Mozilla/5.0 (maquinas_ un_pueblo_feliz)'}


def pedir(url, timeout=90):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def buscar_enlace():
    """Enlace de SharePoint de «(Fuero común - Víctimas). Incidencia delictiva estatal» del año más reciente."""
    mejor = None
    for pagina in PAGINAS:
        texto = pedir(pagina).decode('utf-8', 'replace')
        for href, etiqueta in re.findall(r'href="(https://[^"]*sharepoint\.com/[^"]+)"[^>]*>(.{0,200}?)</a>', texto, re.S):
            et = html.unescape(re.sub(r'<[^>]+>', ' ', etiqueta)).replace('\xa0', ' ')
            et_n = et.lower()
            if 'víctimas' not in et_n or 'estatal' not in et_n or 'fuero com' not in et_n or 'tablero' in et_n:
                continue
            anios = [int(a) for a in re.findall(r'(20\d\d)', et)]
            if not anios or ' - 20' in et and min(anios) < max(anios) - 1:   # descarta series históricas (2015 - 2025)
                continue
            if mejor is None or max(anios) > mejor[0]:
                mejor = (max(anios), html.unescape(href), et.strip())
    if not mejor:
        raise RuntimeError('no encontré el enlace de víctimas estatal en las páginas del SESNSP')
    return mejor


def descargar(href):
    m = re.search(r'/personal/([^/]+)/([^/?]+)', href)
    if not m:
        raise RuntimeError(f'enlace inesperado: {href}')
    persona, token = m.groups()
    url = f'https://sspcgob-my.sharepoint.com/personal/{persona}/_layouts/15/download.aspx?share={token}'
    datos = pedir(url, timeout=180)
    if datos[:2] != b'PK':
        raise RuntimeError('la descarga no es un zip (¿cambió la plataforma?)')
    return datos


def leer_csv(datos):
    if datos[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(datos))
        nombre = next(n for n in z.namelist() if n.lower().endswith('.csv'))
        datos = z.read(nombre)
    for cod in ('utf-8-sig', 'latin-1'):
        try:
            texto = datos.decode(cod)
            break
        except UnicodeDecodeError:
            continue
    return list(csv.DictReader(io.StringIO(texto)))


def num(v):
    v = (v or '').replace(',', '').strip()
    return int(float(v)) if v else 0


def calcular(filas):
    anio = int(filas[0]['Año'])
    def serie(cond):
        s = [0] * 12
        for f in filas:
            if cond(f):
                for i, m in enumerate(MESES):
                    s[i] += num(f.get(m))
        return s
    sub = lambda f: f['Subtipo de delito']
    hom = serie(lambda f: sub(f) == 'Homicidio doloso')
    ultimo = max((i for i, v in enumerate(hom) if v > 0), default=-1)
    if ultimo < 0:
        raise RuntimeError('la base no trae homicidios con datos')
    mes = MESES[ultimo].lower()
    periodo = f'{mes} de {anio}'
    acum = f'de enero a {mes} de {anio}' if ultimo > 0 else periodo
    fem = serie(lambda f: sub(f) == 'Feminicidio')
    ext = serie(lambda f: f['Tipo de delito'] == 'Extorsión' and not sub(f).startswith('Tentativa'))
    sec = serie(lambda f: f['Tipo de delito'] == 'Secuestro')
    trata = serie(lambda f: f['Tipo de delito'] == 'Trata de personas')
    nna = serie(lambda f: sub(f) == 'Homicidio doloso' and f['Rango de edad'] in ('0 a 12 años', '13 a 17 años'))
    vf = serie(lambda f: sub(f) == 'Violencia familiar')
    tot = lambda s: sum(s[:ultimo + 1])
    dias = calendar.monthrange(anio, ultimo + 1)[1]
    fmt = lambda n: f'{n:,}'
    base = {'fuente': 'SESNSP', 'tipo': 'oficial', 'periodo': periodo, 'url': FUENTE_URL}
    cifras = [
        ('hom-mes', fmt(hom[ultimo]), f'víctimas de homicidio doloso en {periodo}'),
        ('hom-dia', fmt(round(hom[ultimo] / dias)), f'personas asesinadas al día, en promedio, en {periodo}'),
        ('hom-acum', fmt(tot(hom)), f'víctimas de homicidio doloso {acum}'),
        ('fem-mes', fmt(fem[ultimo]), f'víctimas de feminicidio en {periodo}'),
        ('fem-acum', fmt(tot(fem)), f'víctimas de feminicidio {acum}'),
        ('ext-acum', fmt(tot(ext)), f'víctimas de extorsión {acum}'),
        ('sec-acum', fmt(tot(sec)), f'víctimas de secuestro {acum}'),
        ('trata-acum', fmt(tot(trata)), f'víctimas de trata de personas {acum}'),
        ('nna-acum', fmt(tot(nna)), f'niñas, niños y adolescentes víctimas de homicidio doloso {acum}'),
        ('vf-acum', fmt(tot(vf)), f'víctimas de violencia familiar {acum}'),
    ]
    return [dict(base, id=i, numero=n, texto=t) for i, n, t in cifras if n != '0'], periodo


def main():
    previo = json.loads(SALIDA.read_text('utf-8')) if SALIDA.exists() else {}
    manual = json.loads(MANUAL.read_text('utf-8')) if MANUAL.exists() else []
    try:
        if len(sys.argv) > 1:
            filas = leer_csv(Path(sys.argv[1]).read_bytes())
        else:
            anio, href, etiqueta = buscar_enlace()
            print(f'fuente: {etiqueta}')
            filas = leer_csv(descargar(href))
        auto, periodo = calcular(filas)
        estado = f'SESNSP actualizado: {periodo}'
    except Exception as e:  # la página o la plataforma cambiaron: se conservan las cifras anteriores
        auto = [c for c in previo.get('cifras', []) if c.get('auto')]
        estado = f'no se pudo actualizar el SESNSP ({e}); se conservan las cifras anteriores'
        if not auto:
            print(estado)
    for c in auto:
        c['auto'] = True
    salida = {'actualizado': date.today().isoformat(), 'estado': estado, 'cifras': auto + manual}
    if previo.get('cifras') == salida['cifras']:
        print(f'sin cambios · {estado}')
        return
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(f'{len(salida["cifras"])} cifras · {estado}')


if __name__ == '__main__':
    main()
