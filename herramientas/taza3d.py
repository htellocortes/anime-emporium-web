"""Mockup 3D de tazas sublimadas (render por ray marching con numpy).

Uso:
  python3 taza3d.py diseno.png salida.jpg [--fondo morado|blanco] [--una]

La plantilla se asume envolvente, con la unión (junto al asa) en los bordes izquierdo y derecho.
Por defecto dibuja dos tazas: la izquierda muestra el lado izquierdo del diseño y la derecha el derecho.
Con --una dibuja una sola taza mostrando el lado derecho del diseño.
"""
import sys
import argparse
import numpy as np
from PIL import Image

# ---------- parámetros de la taza (radio 1 = 4.1 cm) ----------
R = 1.0          # radio exterior
H = 2.32         # alto (taza 11 oz: 8.2 x 9.5 cm)
T = 0.075        # grosor de pared
TB = 0.14        # grosor de base
RND = 0.035      # redondeo de bordes
PH = 0.90 * H    # alto impreso

FONDOS = {
    # (pared arriba, pared centro, piso, brillo detrás)
    "morado": (np.array([0.05, 0.012, 0.09]), np.array([0.30, 0.07, 0.42]),
               np.array([0.20, 0.05, 0.30]), np.array([0.55, 0.20, 0.70])),
    "blanco": (np.array([0.62, 0.62, 0.66]), np.array([0.92, 0.92, 0.95]),
               np.array([0.80, 0.80, 0.84]), np.array([1.0, 1.0, 1.0])),
}


def srgb_a_lineal(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lineal_a_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


# ---------- SDF ----------
def sd_cilindro(px, py, pz, r, y0, y1, rnd=0.0):
    rad = np.sqrt(px * px + pz * pz)
    cy = (y0 + y1) / 2
    hh = (y1 - y0) / 2
    dx = rad - (r - rnd)
    dy = np.abs(py - cy) - (hh - rnd)
    return (np.minimum(np.maximum(dx, dy), 0)
            + np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2) - rnd)


def sd_asa(px, py, pz):
    cx, cy = R + 0.30, H * 0.53
    qx, qy = px - cx, (py - cy) / 1.28
    k = np.sqrt(qx * qx + qy * qy) - 0.56
    tor = (np.sqrt(k * k + (pz / 1.15) ** 2) - 0.105) * 0.9
    return np.maximum(tor, (R - 0.06) - px)


def suavemin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def sd_taza_local(px, py, pz):
    ext = sd_cilindro(px, py, pz, R, 0.0, H, RND)
    inte = sd_cilindro(px, py, pz, R - T, TB, H + 1.0, 0.02)
    cuerpo = np.maximum(ext, -inte)
    asa = sd_asa(px, py, pz)
    return suavemin(cuerpo, asa, 0.06), cuerpo, asa


class Escena:
    def __init__(self, tazas):
        # tazas: lista de (x, z, angulo)
        self.tazas = [(x, z, np.cos(a), np.sin(a)) for x, z, a in tazas]

    def local(self, i, px, py, pz):
        x, z, c, s = self.tazas[i]
        qx, qz = px - x, pz - z
        # rotación de mundo a local (inversa de girar la taza en a)
        return qx * c + qz * s, py, -qx * s + qz * c

    def sdf(self, px, py, pz, detalle=False):
        mejor = None
        for i in range(len(self.tazas)):
            lx, ly, lz = self.local(i, px, py, pz)
            d, cu, asa = sd_taza_local(lx, ly, lz)
            if mejor is None:
                mejor, idx = d, np.zeros_like(d, dtype=int)
                if detalle:
                    info = [lx, ly, lz, cu, asa]
            else:
                m = d < mejor
                mejor = np.where(m, d, mejor)
                idx = np.where(m, i, idx)
                if detalle:
                    for j, v in enumerate((lx, ly, lz, cu, asa)):
                        info[j] = np.where(m, v, info[j])
        if detalle:
            return mejor, idx, info
        return mejor


def normal(esc, px, py, pz):
    e = 0.0015
    k = [(1, -1, -1), (-1, -1, 1), (-1, 1, -1), (1, 1, 1)]
    nx = ny = nz = 0
    for a, b, c in k:
        d = esc.sdf(px + a * e, py + b * e, pz + c * e)
        nx = nx + a * d
        ny = ny + b * d
        nz = nz + c * d
    n = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9
    return nx / n, ny / n, nz / n


def sombra_suave(esc, px, py, pz, lx, ly, lz, k=10.0, pasos=48):
    res = np.ones_like(px)
    t = np.full_like(px, 0.02)
    for _ in range(pasos):
        d = esc.sdf(px + lx * t, py + ly * t, pz + lz * t)
        res = np.minimum(res, k * d / t)
        t = t + np.clip(d, 0.02, 0.4)
        if np.all((res < 0.001) | (t > 8)):
            break
    return np.clip(res, 0, 1)


def oclusion(esc, px, py, pz, nx, ny, nz):
    occ = 0.0
    w = 1.0
    for i in range(1, 6):
        h = 0.04 + 0.12 * i
        d = esc.sdf(px + nx * h, py + ny * h, pz + nz * h)
        occ = occ + (h - d) * w
        w *= 0.6
    return np.clip(1 - 1.6 * occ, 0, 1)


# ---------- entorno de estudio (para reflejos) ----------
def caja_suave(az, el, a0, a1, e0, e1, borde=0.06):
    fa = np.clip((az - a0) / borde, 0, 1) * np.clip((a1 - az) / borde, 0, 1)
    fe = np.clip((el - e0) / borde, 0, 1) * np.clip((e1 - el) / borde, 0, 1)
    return fa * fe


def entorno(dx, dy, dz, fondo):
    az = np.arctan2(dx, dz)          # 0 = hacia la cámara
    el = np.arcsin(np.clip(dy, -1, 1))
    _, medio, piso, _ = FONDOS[fondo]
    base = np.where(el[..., None] > 0, medio[None, :] * 0.6, piso[None, :] * 0.5)
    luz = (16.0 * caja_suave(az, el, -1.30, -0.62, -0.20, 0.95, 0.05)   # softbox izquierda
           + 10.0 * caja_suave(az, el, 0.80, 1.05, -0.15, 0.85, 0.03)   # tira derecha
           + 3.0 * caja_suave(az, el, -3.2, 3.2, 1.10, 1.6, 0.25))      # techo
    return base + luz[..., None]


# ---------- render ----------
def render(diseno_rgba, salida, fondo="morado", una=False, N=1200):
    dis = srgb_a_lineal(diseno_rgba[..., :3].astype(float))
    alfa = diseno_rgba[..., 3:4].astype(float) / 255
    dis = dis * alfa + 1.0 * (1 - alfa)      # fondo blanco donde sea transparente
    dh, dw = dis.shape[:2]
    pw = PH * dw / dh
    f = pw / (2 * np.pi * R)                 # fracción de la circunferencia impresa

    def theta_de(xfrac):
        return np.pi + np.pi * f - xfrac * 2 * np.pi * f

    def angulo_para(xfrac):
        # gira la taza para que la columna xfrac del diseño quede mirando a la cámara (+z)
        return np.pi / 2 - theta_de(xfrac)

    if una:
        tazas = [(0.0, 0.0, angulo_para(0.72))]
        cam = np.array([0.0, 3.4, 10.5]); mira = np.array([0.2, 1.10, 0.0]); fov = 0.24
    else:
        tazas = [(-1.18, -0.15, angulo_para(0.27)), (1.18, 0.20, angulo_para(0.73))]
        cam = np.array([0.0, 3.6, 12.5]); mira = np.array([0.0, 1.05, 0.0]); fov = 0.29
    esc = Escena(tazas)

    # rayos de cámara
    fw = mira - cam; fw /= np.linalg.norm(fw)
    rt = np.cross(fw, [0, 1, 0]); rt /= np.linalg.norm(rt)
    up = np.cross(rt, fw)
    s = (np.arange(N) + 0.5) / N * 2 - 1
    U, V = np.meshgrid(s, -s)
    dx = fw[0] + fov * (U * rt[0] + V * up[0])
    dy = fw[1] + fov * (U * rt[1] + V * up[1])
    dz = fw[2] + fov * (U * rt[2] + V * up[2])
    dn = np.sqrt(dx * dx + dy * dy + dz * dz)
    dx, dy, dz = (dx / dn).ravel(), (dy / dn).ravel(), (dz / dn).ravel()
    M = dx.size

    # ray marching (solo rayos activos)
    t = np.zeros(M)
    golpe = np.zeros(M, bool)
    activo = np.arange(M)
    tt = np.full(M, 6.0)
    for _ in range(220):
        if activo.size == 0:
            break
        px = cam[0] + dx[activo] * tt[activo]
        py = cam[1] + dy[activo] * tt[activo]
        pz = cam[2] + dz[activo] * tt[activo]
        d = esc.sdf(px, py, pz) * 0.85
        tt[activo] += d
        hit = d < 0.0008
        golpe[activo[hit]] = True
        lejos = tt[activo] > 25
        activo = activo[~hit & ~lejos]
    t = tt

    col = np.zeros((M, 3))
    arriba, medio, piso_c, brillo = FONDOS[fondo]

    # ---- fondo y piso ----
    sin = np.where(~golpe)[0]
    # piso y = 0
    ts = -cam[1] / np.minimum(dy[sin], -1e-6)
    en_piso = (dy[sin] < 0) & (ts < 60)
    # pared: gradiente vertical + resplandor detrás de las tazas
    vy = (V.ravel()[sin] + 1) / 2
    vx = U.ravel()[sin]
    pared = (arriba[None, :] * (vy[:, None] ** 1.2)
             + medio[None, :] * (1 - vy[:, None] ** 1.2))
    glow = np.exp(-((vx / 0.75) ** 2 + ((vy - 0.42) / 0.38) ** 2))[:, None]
    pared = pared + brillo[None, :] * 0.35 * glow
    fondo_col = pared.copy()

    ip = sin[en_piso]
    if ip.size:
        tp = ts[en_piso]
        gx = cam[0] + dx[ip] * tp
        gz = cam[2] + dz[ip] * tp
        gy = np.zeros_like(gx)
        L = np.array([-0.55, 0.75, 0.40]); L /= np.linalg.norm(L)
        sh = sombra_suave(esc, gx, gy + 0.001, gz, *L, k=5.0)
        dd = np.maximum(esc.sdf(gx, gy, gz), 0)
        contacto = 1 - 0.85 * np.exp(-dd / 0.12) - 0.40 * np.exp(-dd / 0.75)
        luzp = (0.30 + 0.70 * sh) * np.clip(contacto, 0.05, 1)
        pc = piso_c[None, :] * (0.8 + 1.0 * np.exp(-(gx ** 2 + (gz - 0.5) ** 2) / 9))[:, None]
        pc = pc * luzp[:, None]
        # funde el piso con la pared hacia el horizonte
        mezcla = np.clip((tp - 14) / 22, 0, 1)[:, None]
        fondo_col[en_piso] = pc * (1 - mezcla) + pared[en_piso] * mezcla
    col[sin] = fondo_col

    # ---- tazas ----
    g = np.where(golpe)[0]
    px = cam[0] + dx[g] * t[g]
    py = cam[1] + dy[g] * t[g]
    pz = cam[2] + dz[g] * t[g]
    _, idx, (lx, ly, lz, cu, asa) = esc.sdf(px, py, pz, detalle=True)
    nx, ny, nz = normal(esc, px, py, pz)

    # albedo: blanco o diseño
    alb = np.full((g.size, 3), 0.86)
    rad = np.sqrt(lx * lx + lz * lz)
    exterior = (cu < asa) & (rad > R - 0.02) & (ly > 0.06) & (ly < H - 0.04)
    th = np.mod(np.arctan2(lz, lx), 2 * np.pi)
    y0 = (H - PH) / 2
    ux = ((np.pi + np.pi * f) - th) / (2 * np.pi * f)
    vy = (y0 + PH - ly) / PH
    imp = exterior & (ux >= 0) & (ux <= 1) & (vy >= 0) & (vy <= 1)
    ix = np.clip(ux[imp] * (dw - 1), 0, dw - 1.001)
    iy = np.clip(vy[imp] * (dh - 1), 0, dh - 1.001)
    x0, y0i = ix.astype(int), iy.astype(int)
    fx, fy = (ix - x0)[:, None], (iy - y0i)[:, None]
    c = (dis[y0i, x0] * (1 - fx) * (1 - fy) + dis[y0i, x0 + 1] * fx * (1 - fy)
         + dis[y0i + 1, x0] * (1 - fx) * fy + dis[y0i + 1, x0 + 1] * fx * fy)
    alb[imp] = c * 0.92

    # iluminación
    L1 = np.array([-0.55, 0.75, 0.40]); L1 /= np.linalg.norm(L1)
    L2 = np.array([0.80, 0.35, -0.45]); L2 /= np.linalg.norm(L2)
    sh = sombra_suave(esc, px + nx * 0.003, py + ny * 0.003, pz + nz * 0.003, *L1, k=8.0, pasos=40)
    ao = oclusion(esc, px, py, pz, nx, ny, nz)
    dif1 = np.clip(nx * L1[0] + ny * L1[1] + nz * L1[2], 0, 1) * sh
    dif2 = np.clip(nx * L2[0] + ny * L2[1] + nz * L2[2], 0, 1)
    amb = (0.20 + 0.10 * ny) * ao
    tinte = medio / medio.max()
    luz = (1.15 * dif1)[:, None] + (0.35 * dif2)[:, None] * tinte[None, :] + amb[:, None] * (0.6 + 0.4 * tinte)[None, :]
    difusa = alb * luz

    # reflejo especular (cerámica esmaltada)
    vx_, vy_, vz_ = -dx[g], -dy[g], -dz[g]
    ndv = np.clip(nx * vx_ + ny * vy_ + nz * vz_, 0, 1)
    rx = 2 * ndv * nx - vx_
    ry = 2 * ndv * ny - vy_
    rz = 2 * ndv * nz - vz_
    fres = 0.045 + 0.955 * (1 - ndv) ** 5
    env = entorno(rx, ry, rz, fondo)
    # los reflejos hacia abajo/adentro quedan tapados por la propia taza
    vis = np.clip(0.25 + 0.75 * ao, 0, 1)[:, None]
    espec = env * fres[:, None] * vis
    col[g] = difusa + espec

    # tono y salida
    img = col.reshape(N, N, 3)
    yy, xx = np.mgrid[0:N, 0:N] / N
    vin = 1 - 0.55 * (((xx - .5) / .75) ** 2 + ((yy - .48) / .7) ** 2)
    img = img * np.clip(vin, 0.25, 1)[..., None] * 1.05
    img = img / (1 + 0.22 * img)                 # compresión suave de altas luces
    img = lineal_a_srgb(img)
    out = Image.fromarray((img * 255 + 0.5).astype(np.uint8)).resize((800, 800), Image.LANCZOS)
    out.save(salida, quality=90, optimize=True, progressive=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("diseno"); ap.add_argument("salida")
    ap.add_argument("--fondo", default="morado", choices=list(FONDOS))
    ap.add_argument("--una", action="store_true")
    ap.add_argument("--n", type=int, default=1200)
    a = ap.parse_args()
    render(np.asarray(Image.open(a.diseno).convert("RGBA")), a.salida, a.fondo, a.una, a.n)
