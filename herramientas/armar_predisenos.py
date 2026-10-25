"""Convierte los PSD de tazas en prediseños para el diseñador web (sin las fotos personales).

Cada prediseño queda como una lista ordenada de capas (de abajo hacia arriba):
  {"img": "fondo.jpg"}                       imagen a tamaño completo
  {"img": "p0.webp", "x": .., "y": ..}       imagen recortada con transparencia
  {"foto": 0, "forma": {...}}                hueco donde va la foto 0 del cliente
  {"texto": {...}}                           texto editable
Todo se escala a 1100 px de alto.
Uso: python herramientas/armar_predisenos.py carpeta_con_psd
"""
import sys, os, json
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import psd, polaroid

ALTO = 1100
SALIDA = os.path.join(os.path.dirname(__file__), "..", "assets", "predisenos")


def componer(info, capas, base=None):
    """Compone capas (lista de objetos Capa, de abajo hacia arriba) sobre un lienzo RGBA."""
    W, H = info["ancho"], info["alto"]
    lienzo = np.zeros((H, W, 4), np.float32) if base is None else base.copy()
    clip_base = None
    for c in capas:
        px = psd.rgba(c)
        if px is None:
            continue
        l, t, r, b = c.caja
        x0, y0, x1, y1 = max(l, 0), max(t, 0), min(r, W), min(b, H)
        if x1 <= x0 or y1 <= y0:
            continue
        src = px[y0 - t:y1 - t, x0 - l:x1 - l]
        a = src[..., 3:4] * c.opacidad / 255
        if getattr(c, "clip", 0) and clip_base is not None:
            a = a * clip_base[y0:y1, x0:x1, None]
        dst = lienzo[y0:y1, x0:x1]
        oa = a + dst[..., 3:4] * (1 - a)
        orgb = (src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)) / np.maximum(oa, 1e-6)
        lienzo[y0:y1, x0:x1] = np.dstack([orgb, oa])
        if not getattr(c, "clip", 0):
            clip_base = np.zeros((H, W), np.float32); clip_base[y0:y1, x0:x1] = src[..., 3]
    return lienzo


def capas_planas(raiz):
    """Lista de capas visibles de abajo hacia arriba (sin grupos ocultos)."""
    out = []
    def rec(n):
        for c in n.hijos:
            if not c.visible:
                continue
            if c.grupo:
                rec(c)
            else:
                out.append(c)
    rec(raiz)
    return out


class Armador:
    def __init__(self, ruta, ident, nombre, categorias):
        self.info, self.raiz, _ = psd.abrir(ruta)
        self.capas = capas_planas(self.raiz)
        self.id = ident; self.nombre = nombre
        self.categorias = [categorias] if isinstance(categorias, str) else list(categorias)
        self.s = ALTO / self.info["alto"]
        self.W = int(round(self.info["ancho"] * self.s))
        self.dir = os.path.join(SALIDA, ident); os.makedirs(self.dir, exist_ok=True)
        self.lista = []; self.n_img = 0; self.fotos = 0; self.textos = []

    def capa(self, nombre):
        for c in self.capas:
            if c.nombre == nombre:
                return c
        raise KeyError(nombre)

    def esc(self, v):
        return round(float(v) * self.s, 1)

    def imagen_completa(self, arr, opaca=True, nombre=None):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")
        im = im.resize((self.W, ALTO), Image.LANCZOS)
        if opaca:
            fn = nombre or "fondo.jpg"
            fondo = Image.new("RGB", im.size, "white"); fondo.paste(im, mask=im.split()[3])
            fondo.save(os.path.join(self.dir, fn), quality=88, optimize=True, progressive=True)
            self.lista.append({"img": fn})
        else:
            self.recorte(arr, 0, 0)

    def recorte(self, rgba, x, y):
        """Guarda una capa con transparencia recortada a su contenido. x, y en coords del PSD."""
        a = rgba[..., 3] > 0.004
        ys, xs = np.where(a)
        if not len(xs):
            return
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        sub = rgba[y0:y1, x0:x1]
        im = Image.fromarray((np.clip(sub, 0, 1) * 255).astype(np.uint8), "RGBA")
        w = max(1, int(round(im.width * self.s))); h = max(1, int(round(im.height * self.s)))
        im = im.resize((w, h), Image.LANCZOS)
        fn = f"c{self.n_img}.webp"; self.n_img += 1
        im.save(os.path.join(self.dir, fn), quality=86, method=6)
        self.lista.append({"img": fn, "x": self.esc(x + x0), "y": self.esc(y + y0)})

    def foto(self, forma):
        self.lista.append({"foto": self.fotos, "forma": forma}); self.fotos += 1

    def texto(self, t):
        self.lista.append({"texto": len(self.textos)}); self.textos.append(t)

    def guardar(self):
        # miniatura para el selector
        return {"id": self.id, "nombre": self.nombre, "categorias": self.categorias,
                "ancho": self.W, "alto": ALTO, "fotos": self.fotos,
                "textos": self.textos, "capas": self.lista, "ruta": f"assets/predisenos/{self.id}/"}


def capa_rgba_doc(a, c):
    """Una capa puesta en un lienzo del tamaño del documento."""
    W, H = a.info["ancho"], a.info["alto"]
    return componer(a.info, [c])


def quad_doc(c, quad):
    l, t = c.caja[0], c.caja[1]
    return quad + np.array([l, t])


def forma_quad(a, q):
    return {"tipo": "quad", "pts": [[a.esc(x), a.esc(y)] for x, y in q]}


def hueco_interior(alpha_doc):
    """Encuentra el hueco transparente cerrado dentro de un marco (por ej. óvalo o cuadrado)."""
    hueco = (alpha_doc < 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(hueco)
    H, W = hueco.shape
    mejor = None
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if x == 0 or y == 0 or x + w >= W or y + h >= H:
            continue            # toca el borde: no es un hueco interior
        if mejor is None or area > st[mejor][4]:
            mejor = k
    return (lab == mejor).astype(np.uint8)


def guardar_capa(a, c):
    """Guarda una capa sola (recortada) y devuelve {img, x, y, w, h} en coordenadas del diseño."""
    px = psd.rgba(c)
    antes = len(a.lista)
    a.recorte(px, c.caja[0], c.caja[1])
    item = a.lista.pop() if len(a.lista) > antes else None
    return item


def color_capa(c):
    px = psd.rgba(c)
    m = px[..., 3] > 0.9
    rgb = np.median(px[..., :3][m], axis=0) * 255
    return "#%02x%02x%02x" % tuple(int(v) for v in rgb)


# Fuentes web parecidas a las del PSD (Segoe Script y Brush Script MT no se pueden publicar en la web)
FUENTE_GRANDE = "{t}px 'Kalam', cursive"
FUENTE_BRUSH = "{t}px 'Damion', cursive"


def frase(a, etiqueta, ejemplo, patron, capas):
    """capas: lista de (nombre_capa, estilo) con estilo 'grande' (Kalam), 'brush' o 'chica' (Damion en mayúsculas)."""
    partes, originales = [], []
    for nombre, estilo in capas:
        c = a.capa(nombre)
        l, t, r, b = c.caja
        w, h = r - l, b - t
        tam = {"grande": h * 1.05, "brush": h * 1.05, "chica": h * 1.45}[estilo]
        partes.append({
            "x": a.esc(l + w / 2), "y": a.esc(t + h / 2), "max": a.esc(w * 1.15), "tam": round(tam * a.s),
            "fuente": FUENTE_GRANDE if estilo == "grande" else FUENTE_BRUSH,
            "color": color_capa(c), "mayus": estilo == "chica"})
        originales.append(guardar_capa(a, c))
    a.texto({"tipo": "frase", "etiqueta": etiqueta, "ejemplo": ejemplo, "patron": patron,
             "partes": partes, "originales": originales})
    return [n for n, _ in capas]


P1 = r"^(.*?\bcomo)\s+(.+?)\s+(eres)\s+(.+)$"
P2 = r"^(.*?\bcomo)\s+(.+?)\s+(eres\b.*)$"


def armar_polaroids(ruta, ident, nombre, categorias, adorno, frases=()):
    a = Armador(ruta, ident, nombre, categorias)
    pol = [c for c in a.capas if c.nombre.startswith("Capa 5") or c.nombre == "Capa 7"]
    usadas = sum((list(n for n, _ in f[3]) for f in frases), [])
    resto = [c for c in a.capas if c not in pol and c.nombre not in usadas]
    a.imagen_completa(componer(a.info, resto))
    for f in frases:
        frase(a, *f)
    for c in pol:                                   # de abajo hacia arriba
        px = psd.rgba(c)
        if adorno:
            q = polaroid.hueco_robusto(px)       # tolera girasoles sobre la foto
        else:
            rect, _ = polaroid.hueco_foto(px)    # tolera fotos con zonas blancas
            q = cv2.boxPoints(rect)
        a.foto(forma_quad(a, quad_doc(c, q)))
        v = polaroid.vaciar(px, q, adorno=adorno)
        a.recorte(v, c.caja[0], c.caja[1])
    return a.guardar()


def armar_marco(ruta, ident, nombre, categorias, foto, marco_desde, forma_tipo, textos=None, excluir=()):
    """Plantillas con una foto bajo un marco con hueco. foto = nombre de la capa de la foto personal."""
    a = Armador(ruta, ident, nombre, categorias)
    i = [c.nombre for c in a.capas].index(foto)
    abajo = [c for c in a.capas[:i] if c.nombre not in excluir]
    arriba = [c for c in a.capas[i + 1:] if c.nombre not in excluir and not (textos and c.nombre in textos)]
    if abajo:
        a.imagen_completa(componer(a.info, abajo))
    else:
        a.lista.append({"color": "#ffffff"})
    # hueco: se busca en la composición de lo que va encima
    enc = componer(a.info, arriba)
    if forma_tipo == "rect_capa":
        c = a.capa(marco_desde); l, t, r, b = c.caja
        forma = {"tipo": "quad", "pts": [[a.esc(l), a.esc(t)], [a.esc(r), a.esc(t)], [a.esc(r), a.esc(b)], [a.esc(l), a.esc(b)]]}
    else:
        h = hueco_interior(enc[..., 3])
        cnts, _ = cv2.findContours(h, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cnt = max(cnts, key=cv2.contourArea)
        if forma_tipo == "elipse":
            (cx, cy), (w, hh), ang = cv2.fitEllipse(cnt)
            forma = {"tipo": "elipse", "cx": a.esc(cx), "cy": a.esc(cy), "rx": a.esc(w / 2 + 6), "ry": a.esc(hh / 2 + 6), "ang": round(ang, 2)}
        else:
            x, y, w, hh = cv2.boundingRect(cnt)
            m = 6
            forma = {"tipo": "quad", "pts": [[a.esc(x - m), a.esc(y - m)], [a.esc(x + w + m), a.esc(y - m)], [a.esc(x + w + m), a.esc(y + hh + m)], [a.esc(x - m), a.esc(y + hh + m)]]}
    a.foto(forma)
    a.recorte(enc, 0, 0)
    for t in (textos or {}).values():
        a.texto(t)
    return a.guardar()


def caja(a, c):
    l, t, r, b = c.caja
    return [a.esc(l), a.esc(t), a.esc(r - l), a.esc(b - t)]


def armar_personaje(ruta, ident, nombre, categorias, grande, mini, debajo_mini, encima_mini, numero, quitar=()):
    """Plantilla donde el cliente sube un personaje (se le quita el fondo en el navegador).
    grande: capa del personaje principal; mini: copia chica (ej. pantalla de la Pokédex).
    debajo_mini / encima_mini: capas que van entre medio. numero: capa de texto editable."""
    a = Armador(ruta, ident, nombre, categorias)
    nombres = [c.nombre for c in a.capas]
    sacar = {grande, mini, numero, *quitar, *encima_mini}
    abajo = [c for c in a.capas[:nombres.index(mini)] if c.nombre not in sacar]
    a.imagen_completa(componer(a.info, abajo))
    a.lista.append({"personaje": 0, "caja": caja(a, a.capa(mini)), "ancla": "centro", "margen": 0.04})
    for n in encima_mini:
        guardado = guardar_capa(a, a.capa(n)); a.lista.append(guardado)
    if numero:
        c = a.capa(numero); l, t, r, b = c.caja
        orig = guardar_capa(a, c)
        a.texto({"tipo": "frase", "etiqueta": "Número", "ejemplo": "002", "patron": "^(.+)$", "max_largo": 4,
                 "partes": [{"x": a.esc((l + r) / 2), "y": a.esc((t + b) / 2), "max": a.esc((r - l) * 1.6),
                             "tam": round((b - t) * 1.25 * a.s), "fuente": "800 {t}px 'Nunito', sans-serif",
                             "color": color_capa(c), "mayus": False}],
                 "originales": [orig]})
    cg = a.capa(grande)
    a.lista.append({"sombra": 0, "caja": caja(a, cg)})
    a.lista.append({"personaje": 0, "caja": caja(a, cg), "ancla": "abajo", "margen": 0})
    # imagen de ejemplo (la que trae el PSD) y guías para el cliente
    px = psd.rgba(cg)
    ys, xs = np.where(px[..., 3] > 0.02)
    sub = px[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ej = Image.fromarray((np.clip(sub, 0, 1) * 255).astype(np.uint8), "RGBA")
    ej.thumbnail((900, 900), Image.LANCZOS)
    ej.save(os.path.join(a.dir, "ejemplo.webp"), quality=88, method=6)
    blanco = Image.new("RGB", ej.size, "white"); blanco.paste(ej, mask=ej.split()[3])
    blanco.thumbnail((260, 260)); blanco.save(os.path.join(a.dir, "guia-bien.jpg"), quality=85)
    # mal: el mismo personaje sobre un paisaje (foto con escenario)
    fondo = Image.open(os.path.join(SALIDA, "polaroids-girasoles", "fondo.jpg")).convert("RGB")
    fondo = fondo.crop((300, 300, 300 + ej.width, 300 + ej.height)).resize(ej.size)
    fondo.paste(ej, mask=ej.split()[3]); fondo.thumbnail((260, 260))
    fondo.save(os.path.join(a.dir, "guia-mal.jpg"), quality=85)
    r = a.guardar()
    r["personaje"] = {"ejemplo": "ejemplo.webp", "guia_bien": "guia-bien.jpg", "guia_mal": "guia-mal.jpg"}
    r["fotos"] = 1
    return r


def capa_por_nombre(raiz, nombre):
    for _, c in psd.recorrer(raiz):
        if c.nombre.strip() == nombre and not c.grupo:
            return c
    raise KeyError(nombre)


def suavizar_mascara(m, cerrar=9, abrir=5):
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((abrir, abrir), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((cerrar, cerrar), np.uint8))
    # rellena agujeros chicos dentro del hueco
    n, lab, st, _ = cv2.connectedComponentsWithStats((1 - m).astype(np.uint8))
    H, W = m.shape
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if x > 0 and y > 0 and x + w < W and y + h < H and area < 0.02 * m.sum():
            m[lab == k] = 1
    return m


def guardar_con_hueco(a, comp_rgb, hueco):
    """Guarda la imagen compuesta con el hueco transparente (borde suave) y agrega el hueco de foto debajo."""
    H, W = hueco.shape
    alfa = 1 - cv2.GaussianBlur(hueco.astype(np.float32), (5, 5), 0)
    alfa = np.minimum(alfa, 1 - (cv2.erode(hueco, np.ones((3, 3), np.uint8)) > 0))
    rgba = np.dstack([comp_rgb.astype(np.float32) / 255, alfa])
    ys, xs = np.where(hueco > 0)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    a.lista.append({"foto": a.fotos, "forma": {"tipo": "caja", "pts": [[a.esc(x0), a.esc(y0)], [a.esc(x1), a.esc(y0)], [a.esc(x1), a.esc(y1)], [a.esc(x0), a.esc(y1)]]}})
    a.fotos += 1
    return rgba


def armar_compuesta_con_foto(ruta, ident, nombre, categorias, capas_foto=("COLOCA TU FOTO AQUI",)):
    """Plantillas de terceros (ej. SubliPlantillas) en 16 bits: la foto de ejemplo está en una capa
    recortada por formas vectoriales. Se usa la imagen compuesta del PSD y se abre el hueco donde
    esa capa es la que se ve."""
    a = Armador(ruta, ident, nombre, categorias)
    info, raiz, comp = psd.abrir(ruta)
    H, W = comp.shape[:2]
    rgba = None
    huecos = []
    for nombre_capa in capas_foto:
        c = capa_por_nombre(raiz, nombre_capa)
        px = (psd.rgba(c) * 255)
        l, t, r, b = c.caja
        x0, y0, x1, y1 = max(l, 0), max(t, 0), min(r, W), min(b, H)
        sub = px[y0 - t:y1 - t, x0 - l:x1 - l]
        dif = np.abs(comp[y0:y1, x0:x1].astype(np.float32) - sub[..., :3]).max(-1)
        coincide = (dif <= 6) & (sub[..., 3] > 200)
        m = np.zeros((H, W), np.uint8); m[y0:y1, x0:x1] = coincide
        huecos.append(suavizar_mascara(m))
    for h in huecos:
        rgba = guardar_con_hueco(a, comp, h) if rgba is None else rgba
    if len(huecos) > 1:
        tot = np.clip(sum(huecos), 0, 1).astype(np.uint8)
        rgba[..., 3] = np.minimum(rgba[..., 3], 1 - tot)
    a.recorte(rgba, 0, 0)
    a.lista[-1]["entero"] = True
    return a.guardar()


def armar_huecos_blancos(ruta, ident, nombre, categorias, min_area=0.02):
    """Plantillas que ya traen los huecos de foto en blanco: cada región blanca grande y cerrada es un hueco."""
    a = Armador(ruta, ident, nombre, categorias)
    info, raiz, comp = psd.abrir(ruta)
    H, W = comp.shape[:2]
    blanco = (comp.min(-1) >= 248).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(blanco)
    huecos = []
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if area < min_area * W * H or x == 0 or y == 0 or x + w >= W or y + h >= H:
            continue
        huecos.append((x, suavizar_mascara(lab == k, 5, 3)))
    huecos.sort()
    tot = np.zeros((H, W), np.uint8)
    for _, h in huecos:
        guardar_con_hueco(a, comp, h); tot |= h
    alfa = 1 - cv2.GaussianBlur(tot.astype(np.float32), (5, 5), 0)
    alfa = np.minimum(alfa, 1 - (cv2.erode(tot, np.ones((3, 3), np.uint8)) > 0))
    a.recorte(np.dstack([comp.astype(np.float32) / 255, alfa]), 0, 0)
    a.lista[-1]["entero"] = True
    return a.guardar()


def armar_fijo(ruta, ident, nombre, categorias):
    """Diseño listo: sin foto ni textos. ruta puede ser PSD o imagen (jpg/png)."""
    if ruta.lower().endswith(".psd"):
        info, raiz, comp = psd.abrir(ruta)
        im = Image.fromarray(comp)
    else:
        im = Image.open(ruta).convert("RGB")
    dest = os.path.join(SALIDA, ident); os.makedirs(dest, exist_ok=True)
    s = ALTO / im.height
    W = int(round(im.width * s))
    im = im.resize((W, ALTO), Image.LANCZOS)
    im.save(os.path.join(dest, "fondo.jpg"), quality=86, optimize=True, progressive=True)
    return {"id": ident, "nombre": nombre, "categorias": list(categorias), "ancho": W, "alto": ALTO,
            "fotos": 0, "textos": [], "capas": [{"img": "fondo.jpg"}], "ruta": f"assets/predisenos/{ident}/", "listo": True}


def miniaturas(lista, ancho=420):
    """Vista chica de cada prediseño con los huecos de foto en gris, para el selector."""
    from PIL import ImageDraw
    for p in lista:
        im = Image.new("RGBA", (p["ancho"], p["alto"]), "white")
        for c in p["capas"]:
            if "img" in c:
                t = Image.open(os.path.join(SALIDA, p["id"], c["img"])).convert("RGBA")
                im.alpha_composite(t, (int(round(c.get("x", 0))), int(round(c.get("y", 0)))))
            elif "color" in c:
                im.paste(c["color"], (0, 0, p["ancho"], p["alto"]))
            elif "texto" in c and p["textos"][c["texto"]].get("tipo") == "frase":
                for o in p["textos"][c["texto"]]["originales"]:
                    t = Image.open(os.path.join(SALIDA, p["id"], o["img"])).convert("RGBA")
                    im.alpha_composite(t, (int(round(o["x"])), int(round(o["y"]))))
            elif "foto" in c:
                d = ImageDraw.Draw(im); f = c["forma"]
                if f["tipo"] in ("quad", "caja"):
                    d.polygon([tuple(pt) for pt in f["pts"]], fill=(200, 192, 222, 255))
                else:
                    d.ellipse([f["cx"] - f["rx"], f["cy"] - f["ry"], f["cx"] + f["rx"], f["cy"] + f["ry"]], fill=(200, 192, 222, 255))
        im = im.convert("RGB"); im.thumbnail((ancho, ancho))
        im.save(os.path.join(SALIDA, p["id"], "miniatura.jpg"), quality=82, optimize=True)
        p["miniatura"] = "miniatura.jpg"


def _correr(t):
    f, a, k = t
    return f(*a, **k)


def slug(t):
    import unicodedata, re
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


if __name__ == "__main__":
    import glob
    from concurrent.futures import ProcessPoolExecutor
    carpeta = sys.argv[1]
    P = lambda n: os.path.join(carpeta, n)
    con_foto = []   # (funcion, args, kwargs)

    con_foto.append((armar_personaje, (P("ivysaur.psd"), "pokedex", "Tu Pokémon en la Pokédex", ["Pokémon"]),
                     dict(grande="Capa 7", mini="Capa 7 copia", debajo_mini=(), encima_mini=["Capa 5", "Capa 6"], numero="002", quitar=["sombra"])))
    con_foto.append((armar_polaroids, (P("taza_mama_thyare.psd"), "polaroids-noche", "Polaroids · Mamá y Abuela", ["Día de la Madre"]), dict(adorno=False, frases=[
        ("Frase de arriba", "Como Abuela eres la mejor", P1, [("COMO", "chica"), ("Abuela", "grande"), ("ERES", "chica"), ("La mejor", "brush")]),
        ("Frase de abajo", "Pero como Madre eres única", P2, [("PERO COMO", "chica"), ("Madre", "grande"), ("ERES UNICA", "chica")])])))
    con_foto.append((armar_polaroids, (P("taza_abuela_thyare.psd"), "polaroids-girasoles", "Girasoles · Mamá y Abuela", ["Día de la Madre"]), dict(adorno=True, frases=[
        ("Frase de arriba", "Como Madre eres la mejor", P1, [("COMO", "chica"), ("Madre", "grande"), ("ERES", "chica"), ("La mejor", "brush")]),
        ("Frase de abajo", "Pero como Abuela eres única", P2, [("PERO COMO", "chica"), ("Abuela", "grande"), ("ERES UNICA", "chica")])])))
    for f, i, n in [("FelizDiaMama_05.psd", "mama-flores", "Si las mamás fueran flores"), ("FelizDiaMama_07.psd", "mama-hermosa", "La mamá más hermosa")]:
        con_foto.append((armar_compuesta_con_foto, (P(f), i, n, ["Día de la Madre"]), {}))
    con_foto.append((armar_huecos_blancos, (P("Madre_M_a_001.psd"), "mama-3-fotos", "Feliz Día de la Madre · 3 fotos", ["Día de la Madre"]), {}))
    con_foto.append((armar_huecos_blancos, (P("Madre_M_a_005.psd"), "mama-corazon", "Gracias mamá por tu infinito amor", ["Día de la Madre"]), {}))
    con_foto.append((armar_marco, (P("taza_tio.psd"), "querida-familia", "Querida familia", ["Familia y recuerdos"]), dict(
        foto="Capa 6", marco_desde="Capa 9", forma_tipo="elipse", excluir=("Kena", "Juana", "Mauricio", "Sebita"), textos={
            "Querida familia:": {"etiqueta": "Saludo", "ejemplo": "Querida familia:", "x": 1195, "y": 290, "max": 640, "tam": 64, "fuente": "italic 600 {t}px 'Cormorant Garamond', serif", "color": "#151515", "lineas": 1},
            "Que esta taza los acompañe  en momentos de calma,  conversación": {"etiqueta": "Mensaje", "ejemplo": "Que esta taza los acompañe en momentos de calma, conversación y risas, como las que siempre compartimos juntos.", "x": 1181, "y": 410, "max": 700, "tam": 46, "fuente": "italic 600 {t}px 'Cormorant Garamond', serif", "color": "#151515", "lineas": 5, "alto": 72},
            "Tamy": {"etiqueta": "Firma", "ejemplo": "Con cariño", "x": 1155, "y": 960, "max": 300, "tam": 60, "fuente": "italic 600 {t}px 'Cormorant Garamond', serif", "color": "#151515", "lineas": 1}})))
    con_foto.append((armar_marco, (P("cobreloa.psd"), "papa-cobreloa", "Día del Padre · Cobreloa", ["Día del Padre", "Fútbol chileno"]), dict(
        foto="WhatsApp Image 2025-06-08 at 14.28.57", marco_desde="marco", forma_tipo="rect")))
    for f, i, n in [("DragonBall_02.psd", "dbz-foto", "Dragon Ball Z con tu foto"), ("DragonBall_03.psd", "dbs-foto", "Dragon Ball Super con tu foto")]:
        con_foto.append((armar_compuesta_con_foto, (P(f), i, n, ["Dragon Ball"]), {}))
    for f, i, n in [("Naruto_01.psd", "naruto-foto-1", "Naruto con tu foto · Kunai"), ("Naruto_02.psd", "naruto-foto-2", "Naruto con tu foto · Shippuden"), ("Naruto_03.psd", "naruto-foto-3", "Naruto con tu foto · Manga")]:
        con_foto.append((armar_compuesta_con_foto, (P(f), i, n, ["Naruto"]), {}))
    con_foto.append((armar_marco, (P("harry.psd"), "harry-potter", "Mundo mágico", ["Películas y series"]), dict(foto="foto", marco_desde="Rectángulo 1", forma_tipo="rect_capa")))

    # Diseños listos: cada archivo dentro de listos/<Categoría>/ (psd, jpg o png). El nombre del archivo es el nombre del diseño.
    listos = []
    for ruta in sorted(glob.glob(os.path.join(carpeta, "listos", "*", "*"))):
        if os.path.splitext(ruta)[1].lower() not in (".psd", ".jpg", ".jpeg", ".png", ".webp"):
            continue
        cat = os.path.basename(os.path.dirname(ruta)); nom = os.path.splitext(os.path.basename(ruta))[0]
        listos.append((armar_fijo, (ruta, slug(cat) + "-" + slug(nom), nom, [cat]), {}))

    trabajos = con_foto + listos
    # la guía del personaje usa el fondo de girasoles: ese se arma primero
    previo = {t[1][1]: _correr(t) for t in con_foto if t[1][1] == "polaroids-girasoles"}
    resto = [t for t in trabajos if t[1][1] not in previo]
    with ProcessPoolExecutor(6) as ex:
        hechos = dict(zip([t[1][1] for t in resto], ex.map(_correr, resto)))
    hechos.update(previo)
    lista = [hechos[t[1][1]] for t in trabajos]
    for p in lista:
        s = p["alto"] / 1122 if p["id"] == "querida-familia" else 1
        for t in p["textos"]:
            if t.get("tipo") == "frase":
                continue
            for k in ("x", "y", "max", "alto"):
                if k in t: t[k] = round(t[k] * s, 1)
            t["tam"] = round(t["tam"] * s)
    miniaturas(lista)
    dest = os.path.join(os.path.dirname(__file__), "..", "data", "predisenos.json")
    json.dump(lista, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("listo:", len(lista), "prediseños,", sum(1 for p in lista if p["fotos"]), "con foto")
