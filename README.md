# Anime Emporium — sitio web

Sitio estático (HTML + CSS + JS, sin build). Cuatro páginas:

- `index.html` — inicio: destacados, colecciones, personalizados, nosotros y contacto.
- `catalogo.html` — todos los productos con filtros. Acepta `?coleccion=pokemon` y `?categoria=Tazas`.
- `producto.html?id=taza-pokemon-bulbasaur` — ficha de cada producto (se arma sola desde el JSON).
  Este es el link que puedes pegar en Instagram para un producto específico.
- `personalizados.html` — diseñador de tazas: el cliente sube su foto, elige un prediseño, escribe su texto
  y ve la taza en 3D al instante. Luego la envía por WhatsApp (en celular comparte la imagen directo;
  en computador la descarga y abre el chat). La foto nunca se sube a un servidor.

## Editar
- **Contacto** (WhatsApp, Instagram, correo): `js/config.js`
- **Productos, categorías, ocasiones y colecciones**: `data/productos.json`
  - `id`: único, sin espacios ni tildes (se usa en el link de la ficha).
  - `imagen: null` muestra una ilustración con "Foto pronto".
  - `precio: null` muestra "Precio a consultar"; pon un número (ej. 8990) para mostrarlo.
  - `linkPago`: pega un link de pago (Mercado Pago, Flow) y aparece el botón "Comprar".
  - `destacado: true`: aparece en el inicio (se muestran los primeros 4).
  - `coleccion`: el `id` de una colección; así la colección del inicio lleva al catálogo filtrado.
    Las colecciones sin productos abren WhatsApp.
- **Fotos**: `assets/img/productos/` y `assets/img/colecciones/` (cuadradas, ~800 px).

## Mockups de tazas
`herramientas/taza3d.py` genera la foto 3D de una taza a partir de tu plantilla PNG envolvente
(la unión junto al asa en los bordes izquierdo y derecho).

```
pip install numpy pillow
python herramientas/taza3d.py diseno.png assets/img/productos/taza-nueva.jpg
python herramientas/taza3d.py diseno.png salida.jpg --fondo blanco
python herramientas/taza3d.py diseno.png salida.jpg --una
```

## Diseñador de tazas
- Prediseños: en `js/disenador.js`, objeto `PLANTILLAS` (nombre y textos de ejemplo) y `DIBUJO`
  (cómo se dibuja cada uno sobre un lienzo de 2000 × 1100, la proporción de la plantilla de sublimado).
  El lado izquierdo del diseño (x ≈ 540) se ve en la taza izquierda y el derecho (x ≈ 1460) en la derecha.
- La vista 3D usa los mapas de `assets/img/taza/`, generados con:
  `python herramientas/taza3d.py blanco assets/img/taza/base.jpg --n 1600 --mapas assets/img/taza`
  Si cambias la cámara o la luz en `taza3d.py`, vuelve a correr ese comando.

## Prediseños y diseños listos
Todo sale de una carpeta con tus archivos usando:
`python herramientas/armar_predisenos.py carpeta_fuentes`

- **Diseños listos** (sin foto): pon el PSD, JPG o PNG en `carpeta_fuentes/listos/<Categoría>/<Nombre del diseño>.psd`.
  La carpeta es la categoría del filtro y el nombre del archivo es el nombre del diseño. Se procesan solos.
- **Plantillas con foto**: se agregan al final del script (`armar_compuesta_con_foto`, `armar_huecos_blancos`,
  `armar_polaroids`, `armar_marco` o `armar_personaje`). El script saca las fotos de ejemplo y deja el hueco.
  - Plantillas tipo SubliPlantillas: la foto debe estar en la capa "COLOCA TU FOTO AQUI".
  - Plantillas con huecos en blanco: cada zona blanca cerrada grande es un hueco.
- Genera `assets/predisenos/<id>/` y `data/predisenos.json`.

Link directo a un diseño: `personalizados.html?diseno=<id>`; a una categoría: `personalizados.html?categoria=One Piece`.

## Vista 3D
`assets/img/taza/` (dos lados) y `assets/img/taza-frente/` (frente) son mapas generados con:
```
python herramientas/taza3d.py blanco assets/img/taza/base.jpg --n 1600 --mapas assets/img/taza
python herramientas/taza3d.py blanco assets/img/taza-frente/base.jpg --una --centro 0.5 --n 1600 --mapas assets/img/taza-frente
```

## Probar en local
El catálogo se carga con `fetch`, así que no funciona abriendo el archivo con doble clic.
Usa la extensión Live Server de VS Code, o `npx serve .`

## Publicar
Sube la carpeta a GitHub y conéctala a Cloudflare Pages (sin comando de build, carpeta de salida `/`).
