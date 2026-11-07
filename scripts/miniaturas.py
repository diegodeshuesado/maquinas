"""Genera versiones ligeras de cada pieza para la galería (se crean al publicar, no se guardan en el repo).
mini.jpg   ~600 px de ancho, para la cuadrícula
grande.jpg ~1400 px de ancho, para verla en grande en el celular
"""
from pathlib import Path
from PIL import Image

Image.MAX_IMAGE_PIXELS = 60_000_000
for carpeta in sorted(Path('envios').iterdir()):
    if not carpeta.is_dir():
        continue
    origen = next((carpeta / n for n in ('pieza.jpg', 'pieza.png') if (carpeta / n).exists()), None)
    if not origen:
        continue
    with Image.open(origen) as im:
        im = im.convert('RGB')
        for nombre, ancho in (('mini.jpg', 600), ('grande.jpg', 1400)):
            copia = im.copy()
            if copia.width > ancho:
                copia = copia.resize((ancho, round(copia.height * ancho / copia.width)), Image.LANCZOS)
            copia.save(carpeta / nombre, 'JPEG', quality=84, optimize=True, progressive=True)
    print(f'miniaturas: {carpeta.name}')
