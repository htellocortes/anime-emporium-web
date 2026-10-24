# Anime Emporium — sitio web

Sitio estático (HTML + CSS + JS, sin build). Tres páginas:

- `index.html` — inicio: destacados, colecciones, personalizados, nosotros y contacto.
- `catalogo.html` — todos los productos con filtros. Acepta `?coleccion=pokemon` y `?categoria=Tazas`.
- `producto.html?id=taza-pokemon-bulbasaur` — ficha de cada producto (se arma sola desde el JSON).
  Este es el link que puedes pegar en Instagram para un producto específico.

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

## Probar en local
El catálogo se carga con `fetch`, así que no funciona abriendo el archivo con doble clic.
Usa la extensión Live Server de VS Code, o `npx serve .`

## Publicar
Sube la carpeta a GitHub y conéctala a Cloudflare Pages (sin comando de build, carpeta de salida `/`).
