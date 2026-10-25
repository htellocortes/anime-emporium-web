"""Lector mínimo de PSD (RGB 8 bits): capas, grupos, opacidad, visibilidad y pixeles.
Soporta compresión raw, RLE (PackBits) y ZIP (con y sin predicción)."""
import struct, zlib
import numpy as np


class Lector:
    def __init__(self, data):
        self.d = data; self.p = 0
    def leer(self, n):
        b = self.d[self.p:self.p + n]; self.p += n; return b
    def u8(self): return self.leer(1)[0]
    def u16(self): return struct.unpack(">H", self.leer(2))[0]
    def i16(self): return struct.unpack(">h", self.leer(2))[0]
    def u32(self): return struct.unpack(">I", self.leer(4))[0]
    def i32(self): return struct.unpack(">i", self.leer(4))[0]
    def u64(self): return struct.unpack(">Q", self.leer(8))[0]


def packbits(datos, n):
    out = bytearray(); i = 0
    while len(out) < n and i < len(datos):
        h = datos[i]; i += 1
        if h < 128:
            out += datos[i:i + h + 1]; i += h + 1
        elif h > 128:
            out += bytes([datos[i]]) * (257 - h); i += 1
    return bytes(out[:n])


class Capa:
    def __init__(self):
        self.nombre = ""; self.hijos = []; self.grupo = False
    def __repr__(self):
        return f"<{'Grupo' if self.grupo else 'Capa'} {self.nombre!r} vis={self.visible} op={self.opacidad} {self.caja}>"


def abrir(ruta):
    r = Lector(open(ruta, "rb").read())
    assert r.leer(4) == b"8BPS"
    ver = r.u16(); psb = ver == 2
    r.leer(6)
    canales = r.u16(); alto = r.u32(); ancho = r.u32(); prof = r.u16(); modo = r.u16()
    info = dict(ancho=ancho, alto=alto, prof=prof, modo=modo, psb=psb)
    r.leer(r.u32())                     # color mode data
    r.leer(r.u32())                     # image resources
    largo_lm = r.u64() if psb else r.u32()
    fin_lm = r.p + largo_lm
    capas = None
    if largo_lm:
        largo_li = r.u64() if psb else r.u32()
        fin_li = r.p + largo_li
        if largo_li and prof == 8:
            capas = leer_capas(r, psb)
        r.p = fin_li
        if capas is None and r.p < fin_lm:
            largo_gm = r.u32(); r.p += largo_gm          # global layer mask info
            while r.p + 12 <= fin_lm:
                firma = r.leer(4)
                if firma not in (b"8BIM", b"8B64"):
                    break
                clave = r.leer(4)
                largo = r.u64() if (psb and clave in (b"Lr16", b"Lr32", b"Layr")) else r.u32()
                ini = r.p
                if clave in (b"Lr16", b"Lr32"):
                    capas = leer_capas(r, psb, prof)
                    break
                r.p = ini + largo + (largo % 4 and 4 - largo % 4 or 0) * 0
    if capas is None:                    # sin capas legibles (por ej. 16 bits): solo la imagen compuesta
        capas = Capa(); capas.nombre = "raiz"; capas.grupo = True
    r.p = fin_lm
    # imagen compuesta
    comp = r.u16()
    compuesta = leer_canales_imagen(r, comp, canales, ancho, alto, psb, prof)
    return info, capas, compuesta


def leer_capas(r, psb, prof=8):
    n = r.i16(); n = abs(n)
    capas = []
    for _ in range(n):
        c = Capa()
        t, l, b, rr = r.i32(), r.i32(), r.i32(), r.i32()
        c.caja = (l, t, rr, b)
        nc = r.u16()
        c.canales = []
        for _ in range(nc):
            cid = r.i16(); largo = r.u64() if psb else r.u32()
            c.canales.append((cid, largo))
        r.leer(4); c.modo = r.leer(4).decode("latin1")
        c.opacidad = r.u8(); c.clip = r.u8(); flags = r.u8(); r.u8()
        c.visible = not (flags & 2)
        extra = r.u32(); fin = r.p + extra
        lm = r.u32(); c.mascara = None
        if lm:
            mt, ml, mb, mr = r.i32(), r.i32(), r.i32(), r.i32()
            c.mascara = dict(caja=(ml, mt, mr, mb), defecto=r.u8())
            r.p += lm - 17
        r.leer(r.u32())                  # blending ranges
        ln = r.u8(); c.nombre = r.leer(ln).decode("latin1", "replace")
        r.p += (4 - (ln + 1) % 4) % 4
        c.divisor = 0
        while r.p < fin:
            firma = r.leer(4); clave = r.leer(4).decode("latin1")
            largo = r.u32()
            if psb and clave in ("LMsk", "Lr16", "Lr32", "Layr", "Mt16", "Mt32", "Mtrn", "Alph", "FMsk", "lnk2", "FEid", "FXid", "PxSD"):
                r.p -= 4; largo = r.u64()
            ini = r.p
            if clave == "luni":
                k = r.u32(); c.nombre = r.leer(k * 2).decode("utf-16-be", "replace").rstrip("\x00")
            elif clave in ("lsct", "lsdk"):
                c.divisor = r.u32()
            elif clave in ("SoLd", "PlLd", "SoLE"):
                c.smart = True
            r.p = ini + largo
            r.p += (2 - largo % 2) % 2 if False else 0
        r.p = fin
        capas.append(c)
    # datos de imagen de cada capa
    for c in capas:
        l, t, rr, b = c.caja
        w, h = rr - l, b - t
        c.px = {}
        for cid, largo in c.canales:
            ini = r.p
            comp = r.u16()
            if cid == -2 and c.mascara:
                ml, mt, mr, mb = c.mascara["caja"]
                cw, ch = mr - ml, mb - mt
            else:
                cw, ch = w, h
            if cw > 0 and ch > 0:
                c.px[cid] = decodificar(r, comp, cw, ch, ini + largo, psb, prof)
            r.p = ini + largo
    return armar_arbol(capas)


def decodificar(r, comp, w, h, fin, psb, prof=8):
    bpp = prof // 8
    fila = w * bpp
    def a8(buf):
        if bpp == 1:
            return np.frombuffer(buf, np.uint8)[: w * h].reshape(h, w).copy()
        return (np.frombuffer(buf, ">u2")[: w * h].reshape(h, w) >> 8).astype(np.uint8)
    if comp == 0:
        return a8(r.leer(fila * h))
    if comp == 1:
        conteos = [r.u32() if psb else r.u16() for _ in range(h)]
        return a8(b"".join(packbits(r.leer(cnt), fila) for cnt in conteos))
    datos = zlib.decompress(r.leer(fin - r.p))
    if comp == 3:
        if bpp == 1:
            a = np.frombuffer(datos, np.uint8)[: w * h].reshape(h, w)
            return np.cumsum(a, axis=1, dtype=np.uint8)
        a = np.frombuffer(datos, ">u2")[: w * h].reshape(h, w).astype(np.uint16)
        a = np.cumsum(a, axis=1, dtype=np.uint16)
        return (a >> 8).astype(np.uint8)
    return a8(datos)


def leer_canales_imagen(r, comp, canales, w, h, psb, prof=8):
    bpp = prof // 8
    fila = w * bpp
    def a8(buf):
        a = np.frombuffer(buf, np.uint8 if bpp == 1 else ">u2").reshape(h, w)
        return a if bpp == 1 else (a >> 8).astype(np.uint8)
    if comp == 1:
        conteos = [r.u32() if psb else r.u16() for _ in range(h * canales)]
        planos = []
        for k in range(min(canales, 3)):
            filas = [packbits(r.leer(cnt), fila) for cnt in conteos[k * h:(k + 1) * h]]
            planos.append(a8(b"".join(filas)))
        return np.stack(planos, -1)
    if comp == 0:
        planos = [a8(r.leer(fila * h)) for _ in range(min(canales, 3))]
        return np.stack(planos, -1)
    return None


def armar_arbol(capas):
    """En el PSD las capas van de abajo hacia arriba; los grupos se cierran con un divisor."""
    raiz = Capa(); raiz.nombre = "raiz"; raiz.grupo = True
    pila = [raiz]
    for c in capas:
        if c.divisor == 3:                 # marcador de fin de grupo (abajo)
            g = Capa(); g.grupo = True; pila[-1].hijos.append(g); pila.append(g)
        elif c.divisor in (1, 2):          # encabezado del grupo
            g = pila.pop()
            g.nombre, g.visible, g.opacidad, g.caja, g.modo = c.nombre, c.visible, c.opacidad, c.caja, c.modo
        else:
            pila[-1].hijos.append(c)
    return raiz


def rgba(c):
    """Pixeles de una capa como RGBA float (0..1), con su máscara aplicada."""
    l, t, rr, b = c.caja
    w, h = rr - l, b - t
    if w <= 0 or h <= 0 or 0 not in c.px:
        return None
    rgb = np.stack([c.px.get(i, np.zeros((h, w), np.uint8)) for i in (0, 1, 2)], -1).astype(np.float32) / 255
    a = c.px.get(-1, np.full((h, w), 255, np.uint8)).astype(np.float32) / 255
    if -2 in c.px and c.mascara:
        ml, mt, mr, mb = c.mascara["caja"]
        m = np.full((h, w), c.mascara["defecto"] / 255, np.float32)
        x0, y0 = max(ml, l), max(mt, t); x1, y1 = min(mr, rr), min(mb, b)
        if x1 > x0 and y1 > y0:
            m[y0 - t:y1 - t, x0 - l:x1 - l] = c.px[-2][y0 - mt:y1 - mt, x0 - ml:x1 - ml] / 255
        a = a * m
    return np.dstack([rgb, a])


def recorrer(nodo, prof=0):
    for h in reversed(nodo.hijos):      # de arriba hacia abajo, como en Photoshop
        yield prof, h
        if h.grupo:
            yield from recorrer(h, prof + 1)
