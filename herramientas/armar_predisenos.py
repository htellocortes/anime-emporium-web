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
    def __init__(self, ruta, ident, nombre, ocasion):
        self.info, self.raiz, _ = psd.abrir(ruta)
        self.capas = capas_planas(self.raiz)
        self.id = ident; self.nombre = nombre; self.ocasion = ocasion
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
        return {"id": self.id, "nombre": self.nombre, "ocasion": self.ocasion,
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


def armar_polaroids(ruta, ident, nombre, ocasion, adorno, frases=()):
    a = Armador(ruta, ident, nombre, ocasion)
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


def armar_marco(ruta, ident, nombre, ocasion, foto, marco_desde, forma_tipo, textos=None, excluir=()):
    """Plantillas con una foto bajo un marco con hueco. foto = nombre de la capa de la foto personal."""
    a = Armador(ruta, ident, nombre, ocasion)
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
                if f["tipo"] == "quad":
                    d.polygon([tuple(pt) for pt in f["pts"]], fill=(200, 192, 222, 255))
                else:
                    d.ellipse([f["cx"] - f["rx"], f["cy"] - f["ry"], f["cx"] + f["rx"], f["cy"] + f["ry"]], fill=(200, 192, 222, 255))
        im = im.convert("RGB"); im.thumbnail((ancho, ancho))
        im.save(os.path.join(SALIDA, p["id"], "miniatura.jpg"), quality=82, optimize=True)
        p["miniatura"] = "miniatura.jpg"


if __name__ == "__main__":
    carpeta = sys.argv[1]
    P = lambda n: os.path.join(carpeta, n)
    lista = []
    lista.append(armar_polaroids(P("taza_mama_thyare.psd"), "polaroids-noche", "Polaroids · Mamá y Abuela", "Día de la Madre", adorno=False, frases=[
        ("Frase de arriba", "Como Abuela eres la mejor", P1, [("COMO", "chica"), ("Abuela", "grande"), ("ERES", "chica"), ("La mejor", "brush")]),
        ("Frase de abajo", "Pero como Madre eres única", P2, [("PERO COMO", "chica"), ("Madre", "grande"), ("ERES UNICA", "chica")]),
    ]))
    lista.append(armar_polaroids(P("taza_abuela_thyare.psd"), "polaroids-girasoles", "Girasoles · Mamá y Abuela", "Día de la Madre", adorno=True, frases=[
        ("Frase de arriba", "Como Madre eres la mejor", P1, [("COMO", "chica"), ("Madre", "grande"), ("ERES", "chica"), ("La mejor", "brush")]),
        ("Frase de abajo", "Pero como Abuela eres única", P2, [("PERO COMO", "chica"), ("Abuela", "grande"), ("ERES UNICA", "chica")]),
    ]))
    lista.append(armar_marco(P("taza_tio.psd"), "querida-familia", "Querida familia", "Recuerdo",
                             foto="Capa 6", marco_desde="Capa 9", forma_tipo="elipse",
                             textos={
                                 "Querida familia:": {"etiqueta": "Saludo", "ejemplo": "Querida familia:", "x": 1195, "y": 290, "max": 640, "tam": 64, "fuente": "italic 600 {t}px 'Cormorant Garamond', serif", "color": "#151515", "lineas": 1},
                                 "Que esta taza los acompañe  en momentos de calma,  conversación": {"etiqueta": "Mensaje", "ejemplo": "Que esta taza los acompañe en momentos de calma, conversación y risas, como las que siempre compartimos juntos.", "x": 1181, "y": 410, "max": 700, "tam": 46, "fuente": "italic 600 {t}px 'Cormorant Garamond', serif", "color": "#151515", "lineas": 5, "alto": 72},
                                 "Tamy": {"etiqueta": "Firma", "ejemplo": "Con cariño", "x": 1155, "y": 960, "max": 300, "tam": 60, "fuente": "italic 600 {t}px 'Cormorant Garamond', serif", "color": "#151515", "lineas": 1},
                             }, excluir=("Kena", "Juana", "Mauricio", "Sebita")))
    lista.append(armar_marco(P("cobreloa.psd"), "papa-cobreloa", "Día del Padre · Cobreloa", "Día del Padre",
                             foto="WhatsApp Image 2025-06-08 at 14.28.57", marco_desde="marco", forma_tipo="rect"))
    lista.append(armar_marco(P("harry.psd"), "harry-potter", "Mundo mágico", "Fans",
                             foto="foto", marco_desde="Rectángulo 1", forma_tipo="rect_capa"))
    # Los textos usan coordenadas del PSD: escalarlos
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
    print("listo:", [p["id"] for p in lista])
