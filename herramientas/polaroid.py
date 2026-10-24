import numpy as np, cv2
import psd

def hueco_foto(px):
    """px: RGBA float de una capa polaroid. Devuelve el rectángulo rotado de la foto (cv2.minAreaRect)."""
    a = px[..., 3] > 0.5
    rgb = (px[..., :3] * 255).astype(np.uint8)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    marco = (hsv[..., 1] < 28) & (hsv[..., 2] > 200)          # papel blanco/gris claro
    foto = a & ~marco
    foto = cv2.morphologyEx(foto.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    foto = cv2.morphologyEx(foto, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(foto)
    k = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    region = (lab == k).astype(np.uint8)
    cnts, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return cv2.minAreaRect(max(cnts, key=cv2.contourArea)), region


def hueco_robusto(px):
    """Como hueco_foto, pero tolera adornos (girasol, cinta) sobre una esquina de la foto.
    Devuelve las 4 esquinas de la foto en coordenadas de la capa."""
    a = px[..., 3] > 0.5
    rgb = (px[..., :3] * 255).astype(np.uint8)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    papel = a & (hsv[..., 1] < 28) & (hsv[..., 2] > 200)
    papel_u8 = cv2.morphologyEx(papel.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cnts, _ = cv2.findContours(papel_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    (cx, cy), (w, h), ang = cv2.minAreaRect(max(cnts, key=cv2.contourArea))
    H, W = a.shape
    M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
    rot = lambda img: cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_NEAREST)
    pr = rot(papel.astype(np.uint8)) > 0
    ar = rot(a.astype(np.uint8)) > 0
    # región del papel alineada
    x0, x1 = int(cx - w / 2), int(cx + w / 2); y0, y1 = int(cy - h / 2), int(cy + h / 2)
    foto = ar & ~pr
    foto[:, :max(x0, 0)] = False; foto[:, x1:] = False; foto[:y0, :] = False; foto[y1:, :] = False
    foto = cv2.morphologyEx(foto.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) > 0
    filas = np.where(foto.sum(1) > 0.5 * w * 0.5)[0]
    cols = np.where(foto.sum(0) > 0.5 * h * 0.4)[0]
    top = np.median([np.argmax(foto[:, c]) for c in cols])
    bot = np.median([foto.shape[0] - 1 - np.argmax(foto[::-1, c]) for c in cols])
    izq = np.median([np.argmax(foto[r, :]) for r in filas])
    der = np.median([foto.shape[1] - 1 - np.argmax(foto[r, ::-1]) for r in filas])
    esq = np.array([[izq, top], [der, top], [der, bot], [izq, bot]], np.float64)
    Mi = cv2.invertAffineTransform(M)
    esq = np.hstack([esq, np.ones((4, 1))]) @ Mi.T
    return esq


def vaciar(px, quad, adorno=True):
    """Devuelve la capa con la foto borrada (alpha 0 dentro del quad), conservando
    los pétalos/hojas del adorno que caen encima de la foto."""
    H, W = px.shape[:2]
    dentro = np.zeros((H, W), np.uint8)
    cv2.fillPoly(dentro, [np.round(quad).astype(np.int32)], 1)
    # un poco hacia afuera para no dejar un borde de foto
    dentro = cv2.dilate(dentro, np.ones((11, 11), np.uint8)) > 0
    out = px.copy()
    conservar = np.zeros((H, W), bool)
    if adorno:
        rgb = (px[..., :3] * 255).astype(np.uint8)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
        h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        a = px[..., 3] > 0.5
        petalo = (h >= 12) & (h <= 35) & (s > 140) & (v > 150)
        hoja = (h >= 33) & (h <= 90) & (s > 70) & (v > 50)
        centro = (h <= 30) & (s > 90) & (v < 125) & (v > 15)
        color = petalo | hoja | centro
        fuera = a & ~dentro & petalo
        n, lab, st, _ = cv2.connectedComponentsWithStats(fuera.astype(np.uint8))
        if n > 1:
            k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            pts = np.column_stack(np.where(lab == k))[:, ::-1].astype(np.float32)
            (ccx, ccy), r = cv2.minEnclosingCircle(pts)
            yy, xx = np.mgrid[0:H, 0:W]
            d2 = (xx - ccx) ** 2 + (yy - ccy) ** 2
            circ = d2 < (r * 1.08) ** 2
            nucleo = d2 < (r * 0.42) ** 2
            conservar = dentro & circ & (petalo | hoja | (centro & nucleo))
            conservar = cv2.morphologyEx(conservar.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            conservar = cv2.morphologyEx(conservar, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
            # solo lo conectado al girasol de afuera
            uni = (conservar > 0) | (lab == k)
            n2, lab2 = cv2.connectedComponents(uni.astype(np.uint8))
            ids = np.unique(lab2[lab == k]); ids = ids[ids > 0]
            conservar = np.isin(lab2, ids) & dentro
    borrar = dentro & ~conservar
    out[..., 3] = np.where(borrar, 0, out[..., 3])
    # borde suave
    alfa = (out[..., 3] * 255).astype(np.uint8)
    out[..., 3] = cv2.GaussianBlur(alfa, (3, 3), 0) / 255 * (px[..., 3] > 0)
    return out
