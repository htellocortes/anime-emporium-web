/* Diseñador de tazas personalizadas.
   El cliente elige un prediseño, sube sus fotos y escribe sus textos.
   El diseño plano se pinta en un canvas y se proyecta sobre la taza 3D usando los mapas
   generados por herramientas/taza3d.py --mapas.
   Hay dos clases de prediseños:
   - "dibujados": definidos en este archivo (PLANTILLAS + DIBUJO), lienzo de 2000 x 1100.
   - "de imagen": hechos desde PSD con herramientas/armar_predisenos.py, listados en
     data/predisenos.json como capas ordenadas (imágenes, huecos de foto y textos).
   Nada se sube a un servidor: todo pasa en el navegador. */
(function () {
  "use strict";

  var cfg = window.AE_CONFIG || {};
  var DW = 2000, DH = 1100;
  var RUTA = "assets/img/taza/";

  var plano = document.createElement("canvas");
  plano.width = DW; plano.height = DH;
  var pctx = plano.getContext("2d");

  var salida = document.getElementById("vista-taza");
  var sctx = salida.getContext("2d");
  var vistaPlano = document.getElementById("vista-plano");
  var vpctx = vistaPlano.getContext("2d");

  var estado = {
    plantilla: null,
    fotos: [],        // [{img, zoom, px, py}] una por hueco
    activa: 0,        // hueco de foto que se está editando
    textos: []
  };

  /* ---------- prediseños dibujados ---------- */
  var PLANTILLAS = {
    cumple: { nombre: "Cumpleaños", fotos: 1, textos: [
      { etiqueta: "Nombre", ejemplo: "Valentina" }, { etiqueta: "Mensaje", ejemplo: "Que tengas un año lleno de alegría" }] },
    mama: { nombre: "Día de la Madre", fotos: 1, textos: [
      { etiqueta: "Para", ejemplo: "Mamá" }, { etiqueta: "Mensaje", ejemplo: "Gracias por todo tu amor" }] },
    papa: { nombre: "Día del Padre", fotos: 1, textos: [
      { etiqueta: "Para", ejemplo: "Papá" }, { etiqueta: "Mensaje", ejemplo: "El mejor del mundo" }] },
    memoria: { nombre: "En memoria", fotos: 1, textos: [
      { etiqueta: "Nombre", ejemplo: "Rosa Elena" }, { etiqueta: "Fechas o frase", ejemplo: "1948 – 2025 · Siempre en nuestros corazones" }] },
    foto: { nombre: "Foto y frase", fotos: 1, textos: [
      { etiqueta: "Frase", ejemplo: "Los mejores amigos" }, { etiqueta: "Segunda línea", ejemplo: "Desde siempre y para siempre" }] },
    completo: { nombre: "Mi diseño completo", fotos: 1, textos: [], completo: true }
  };
  var ORDEN = [];   // ids en el orden del selector

  function azar(semilla) {
    var s = semilla;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function textoAjustado(ctx, texto, x, y, maxAncho, tamano, fuente, alinear) {
    var t = tamano;
    ctx.font = fuente.replace("{t}", t);
    while (ctx.measureText(texto).width > maxAncho && t > 16) {
      t -= 2; ctx.font = fuente.replace("{t}", t);
    }
    ctx.textAlign = alinear || "center";
    ctx.fillText(texto, x, y);
    return t;
  }

  function lineas(ctx, texto, maxAncho, max) {
    var palabras = texto.split(/\s+/), out = [], linea = "";
    palabras.forEach(function (p) {
      var prueba = linea ? linea + " " + p : p;
      if (ctx.measureText(prueba).width > maxAncho && linea) { out.push(linea); linea = p; }
      else linea = prueba;
    });
    if (linea) out.push(linea);
    return out.slice(0, max || 3);
  }

  function parrafo(ctx, texto, x, y, maxAncho, alto, alinear, max) {
    ctx.textAlign = alinear || "center";
    lineas(ctx, texto, maxAncho, max).forEach(function (l, i) { ctx.fillText(l, x, y + i * alto); });
  }

  function texto(i) {
    var p = PLANTILLAS[estado.plantilla];
    return estado.textos[i] || (p.textos[i] && p.textos[i].ejemplo) || "";
  }

  // Dibuja la foto i (o un marcador) dentro del rectángulo x, y, w, h (ya recortado por el que llama)
  function foto(ctx, x, y, w, h, i) {
    var f = estado.fotos[i || 0];
    if (f && f.img) {
      var img = f.img;
      var esc = Math.max(w / img.width, h / img.height) * f.zoom;
      var iw = img.width * esc, ih = img.height * esc;
      ctx.drawImage(img, x + (w - iw) * f.px, y + (h - ih) * f.py, iw, ih);
    } else {
      var activa = (i || 0) === estado.activa && PLANTILLAS[estado.plantilla].fotos > 1;
      var g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, activa ? "#f3e4a6" : "#d9d3e8"); g.addColorStop(1, activa ? "#e6cf6f" : "#b9b0d0");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = activa ? "#b38f12" : "#958bb3";
      var r = Math.min(w, h);
      ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.40, r * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.86, r * 0.32, r * 0.25, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = activa ? "#6b5200" : "#6e6490";
      ctx.font = "800 " + Math.round(r * 0.075) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      var n = PLANTILLAS[estado.plantilla].fotos;
      ctx.fillText(n > 1 ? "Foto " + ((i || 0) + 1) : "Tu foto aquí", x + w / 2, y + h * 0.66);
    }
  }

  function circulo(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function corazon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    ctx.fill();
  }

  // El lado izquierdo del diseño se ve en la taza de la izquierda y el derecho en la otra.
  // Centros útiles: x ~ 540 (izquierda) y x ~ 1460 (derecha).
  var DIBUJO = {
    cumple: function (c, t1, t2) {
      var g = c.createLinearGradient(0, 0, DW, DH);
      g.addColorStop(0, "#ffd84d"); g.addColorStop(0.55, "#ff9f6e"); g.addColorStop(1, "#ff6fa3");
      c.fillStyle = g; c.fillRect(0, 0, DW, DH);
      var r = azar(7), colores = ["#ffffff", "#7b3fe4", "#1fb6c9", "#e3262e", "#ffe680"];
      for (var i = 0; i < 140; i++) {
        c.save();
        c.translate(r() * DW, r() * DH); c.rotate(r() * Math.PI);
        c.fillStyle = colores[i % colores.length]; c.globalAlpha = 0.55 + r() * 0.4;
        if (i % 3) c.fillRect(-14, -5, 28, 10); else { circulo(c, 0, 0, 9); c.fill(); }
        c.restore();
      }
      c.fillStyle = "#3a1460";
      c.font = "120px 'Lilita One', sans-serif"; c.textAlign = "center";
      c.fillText("¡Feliz", 540, 330);
      c.fillText("cumpleaños!", 540, 460);
      c.fillStyle = "#ffffff";
      c.save(); c.shadowColor = "rgba(58,20,96,.45)"; c.shadowOffsetY = 8;
      textoAjustado(c, t1, 540, 640, 820, 150, "{t}px 'Lilita One', sans-serif");
      c.restore();
      c.fillStyle = "#3a1460"; c.font = "800 52px Nunito, sans-serif";
      parrafo(c, t2, 540, 760, 760, 64);
      c.save(); circulo(c, 1460, 550, 360); c.fillStyle = "#ffffff"; c.fill();
      circulo(c, 1460, 550, 336); c.clip(); foto(c, 1124, 214, 672, 672); c.restore();
    },
    mama: function (c, t1, t2) {
      var g = c.createLinearGradient(0, 0, 0, DH);
      g.addColorStop(0, "#ffe3ec"); g.addColorStop(1, "#ffc6d8");
      c.fillStyle = g; c.fillRect(0, 0, DW, DH);
      var r = azar(3);
      for (var i = 0; i < 46; i++) {
        c.fillStyle = i % 2 ? "rgba(233,84,128,.22)" : "rgba(255,255,255,.7)";
        corazon(c, r() * DW, r() * DH, 30 + r() * 50);
      }
      c.fillStyle = "#b8235a"; c.textAlign = "center";
      c.font = "86px 'Dancing Script', cursive"; c.fillText("Feliz día", 540, 300);
      textoAjustado(c, t1, 540, 500, 860, 210, "700 {t}px 'Dancing Script', cursive");
      c.fillStyle = "#7a1d42"; c.font = "700 54px Nunito, sans-serif";
      parrafo(c, t2, 540, 650, 760, 66);
      c.fillStyle = "#e95480"; corazon(c, 540, 820, 70);
      c.save(); redondeado(c, 1150, 170, 620, 760, 300); c.fillStyle = "#ffffff"; c.fill();
      redondeado(c, 1174, 194, 572, 712, 280); c.clip(); foto(c, 1174, 194, 572, 712); c.restore();
    },
    papa: function (c, t1, t2) {
      c.fillStyle = "#14254a"; c.fillRect(0, 0, DW, DH);
      c.save(); c.globalAlpha = 0.18; c.fillStyle = "#3d6fd1";
      for (var x = -DH; x < DW; x += 120) {
        c.beginPath(); c.moveTo(x, DH); c.lineTo(x + 50, DH); c.lineTo(x + 50 + DH, 0); c.lineTo(x + DH, 0); c.fill();
      }
      c.restore();
      c.fillStyle = "#ffd21f"; c.textAlign = "center";
      c.font = "96px 'Lilita One', sans-serif"; c.fillText("FELIZ DÍA", 540, 330);
      c.fillStyle = "#ffffff";
      textoAjustado(c, t1.toUpperCase(), 540, 540, 860, 230, "{t}px 'Lilita One', sans-serif");
      c.fillStyle = "#c9d6f2"; c.font = "800 54px Nunito, sans-serif";
      parrafo(c, t2, 540, 680, 780, 66);
      c.save(); redondeado(c, 1140, 190, 640, 720, 60); c.fillStyle = "#ffd21f"; c.fill();
      redondeado(c, 1164, 214, 592, 672, 44); c.clip(); foto(c, 1164, 214, 592, 672); c.restore();
    },
    memoria: function (c, t1, t2) {
      var g = c.createRadialGradient(DW / 2, DH / 2, 100, DW / 2, DH / 2, DW * 0.7);
      g.addColorStop(0, "#fbf7ef"); g.addColorStop(1, "#e8dcc6");
      c.fillStyle = g; c.fillRect(0, 0, DW, DH);
      c.strokeStyle = "#b8975a"; c.lineWidth = 4;
      c.save(); c.translate(1460, 550); c.scale(1, 1.28);
      c.beginPath(); c.arc(0, 0, 300, 0, Math.PI * 2); c.restore(); c.stroke();
      c.save(); c.translate(1460, 550); c.scale(1, 1.28);
      c.beginPath(); c.arc(0, 0, 282, 0, Math.PI * 2); c.restore(); c.clip();
      foto(c, 1460 - 282, 550 - 361, 564, 722); c.restore();
      c.fillStyle = "#8a6d3b"; c.font = "600 48px 'Cormorant Garamond', serif"; c.textAlign = "center";
      c.fillText("En memoria de", 540, 330);
      c.fillStyle = "#3d3326";
      textoAjustado(c, t1, 540, 500, 880, 140, "700 {t}px 'Dancing Script', cursive");
      c.strokeStyle = "#b8975a"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(360, 570); c.lineTo(720, 570); c.stroke();
      c.fillStyle = "#5b4b35"; c.font = "600 50px 'Cormorant Garamond', serif";
      parrafo(c, t2, 540, 660, 800, 62);
    },
    foto: function (c, t1, t2) {
      c.save(); c.beginPath(); c.rect(0, 0, DW, DH); c.clip(); foto(c, 0, 0, DW, DH); c.restore();
      var g = c.createLinearGradient(0, DH * 0.45, 0, DH);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.72)");
      c.fillStyle = g; c.fillRect(0, 0, DW, DH);
      c.fillStyle = "#ffffff";
      textoAjustado(c, t1, 540, 900, 900, 110, "{t}px 'Lilita One', sans-serif");
      c.font = "800 48px Nunito, sans-serif"; c.fillStyle = "#ffe680";
      parrafo(c, t2, 540, 990, 900, 56);
    },
    completo: function (c) {
      c.save(); c.beginPath(); c.rect(0, 0, DW, DH); c.clip(); foto(c, 0, 0, DW, DH); c.restore();
    }
  };

  /* ---------- prediseños de imagen ---------- */
  var imagenes = {};   // ruta -> Promise<Image>

  function cargarImagen(src) {
    if (!imagenes[src]) {
      imagenes[src] = new Promise(function (ok, mal) {
        var im = new Image();
        im.onload = function () { ok(im); };
        im.onerror = mal;
        im.src = src;
      });
    }
    return imagenes[src];
  }

  function prepararImagenes(p) {
    if (p.listo) return p.listo;
    var cargas = p.capas.filter(function (c) { return c.img; }).map(function (c) {
      return cargarImagen(p.ruta + c.img).then(function (im) { c.imagen = im; });
    });
    (p.textos || []).forEach(function (t) {
      (t.originales || []).forEach(function (o) {
        cargas.push(cargarImagen(p.ruta + o.img).then(function (im) { o.imagen = im; }));
      });
    });
    p.listo = Promise.all(cargas);
    return p.listo;
  }

  function trazarForma(ctx, f) {
    ctx.beginPath();
    if (f.tipo === "quad") {
      ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (var i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
      ctx.closePath();
    } else {
      ctx.ellipse(f.cx, f.cy, f.rx, f.ry, f.ang * Math.PI / 180, 0, Math.PI * 2);
    }
  }

  // Marco orientado del hueco: centro, ángulo y tamaño, para encuadrar la foto derecha dentro de él
  function marcoDe(f) {
    if (f.tipo === "quad") {
      var p = f.pts;
      var ang = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
      // las esquinas pueden venir en cualquier orden: el lado más horizontal manda
      if (Math.abs(ang) > Math.PI / 4 && Math.abs(ang) < 3 * Math.PI / 4) p = [p[1], p[2], p[3], p[0]];
      ang = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
      if (Math.abs(ang) > Math.PI / 2) { p = [p[2], p[3], p[0], p[1]]; ang = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]); }
      var w = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
      var h = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
      var cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
      return { cx: cx, cy: cy, ang: ang, w: w, h: h };
    }
    var a = f.ang * Math.PI / 180, rx = f.rx, ry = f.ry;
    // si la elipse viene girada casi 180° o 90°, se endereza para no dar vuelta la foto
    while (a > Math.PI / 2) a -= Math.PI;
    while (a < -Math.PI / 2) a += Math.PI;
    if (Math.abs(a) > Math.PI / 4) { a = a > 0 ? a - Math.PI / 2 : a + Math.PI / 2; var t = rx; rx = ry; ry = t; }
    return { cx: f.cx, cy: f.cy, ang: a, w: rx * 2, h: ry * 2 };
  }

  function dibujarImagen(ctx, p) {
    p.capas.forEach(function (c) {
      if (c.color) {
        ctx.fillStyle = c.color; ctx.fillRect(0, 0, DW, DH);
      } else if (c.imagen) {
        ctx.drawImage(c.imagen, c.x || 0, c.y || 0, c.imagen.naturalWidth, c.imagen.naturalHeight);
      } else if (c.forma) {
        var m = marcoDe(c.forma);
        ctx.save();
        trazarForma(ctx, c.forma); ctx.clip();
        ctx.translate(m.cx, m.cy); ctx.rotate(m.ang);
        foto(ctx, -m.w / 2, -m.h / 2, m.w, m.h, c.foto);
        ctx.restore();
      } else if (c.texto != null && p.textos[c.texto].tipo === "frase") {
        dibujarFrase(ctx, p.textos[c.texto], estado.textos[c.texto]);
      } else if (c.texto != null) {
        var t = p.textos[c.texto], valor = texto(c.texto);
        ctx.save();
        ctx.fillStyle = t.color || "#111";
        ctx.textBaseline = "alphabetic";
        if ((t.lineas || 1) > 1) {
          ctx.font = t.fuente.replace("{t}", t.tam);
          parrafo(ctx, valor, t.x, t.y, t.max, t.alto || t.tam * 1.4, "center", t.lineas);
        } else {
          textoAjustado(ctx, valor, t.x, t.y, t.max, t.tam, t.fuente, "center");
        }
        ctx.restore();
      }
    });
  }

  // Frases en partes ("como" + palabra grande + "eres" + ...): sin editar se muestra el lettering original;
  // al editar, la frase se separa con el patrón del prediseño y cada parte va en su lugar y estilo.
  function partesDeFrase(t, valor) {
    var m = new RegExp(t.patron, "i").exec(valor.trim().replace(/\s+/g, " "));
    if (m) return m.slice(1);
    // no calza con el patrón: toda la frase va en la parte grande principal
    var partes = t.partes.map(function () { return ""; });
    var mayor = 0;
    t.partes.forEach(function (pt, i) { if (!pt.mayus && pt.tam > t.partes[mayor].tam) mayor = i; });
    partes[mayor] = valor.trim();
    return partes;
  }

  function dibujarFrase(ctx, t, valor) {
    if (!valor) {
      (t.originales || []).forEach(function (o) {
        if (o && o.imagen) ctx.drawImage(o.imagen, o.x, o.y, o.imagen.naturalWidth, o.imagen.naturalHeight);
      });
      return;
    }
    var partes = partesDeFrase(t, valor);
    t.partes.forEach(function (pt, i) {
      var txt = (partes[i] || "").trim();
      if (!txt) return;
      if (pt.mayus) txt = txt.toUpperCase();
      else txt = txt.charAt(0).toUpperCase() + txt.slice(1);
      ctx.save();
      ctx.fillStyle = pt.color;
      ctx.textBaseline = "middle";
      textoAjustado(ctx, txt, pt.x, pt.y, pt.max, pt.tam, pt.fuente, "center");
      ctx.restore();
    });
  }

  function dibujarPlano(ctx, id) {
    var p = PLANTILLAS[id];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (p.capas) dibujarImagen(ctx, p);
    else DIBUJO[id](ctx, texto(0), texto(1));
    ctx.restore();
  }

  /* ---------- proyección sobre la taza ---------- */
  var mapa = null;
  var aLineal = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i / 255;
    aLineal[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  var aSRGB = new Uint8ClampedArray(4096);
  for (var j = 0; j < 4096; j++) {
    var l = j / 4095;
    aSRGB[j] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
  }

  function pixeles(im) {
    var cv = document.createElement("canvas");
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    var cx = cv.getContext("2d");
    cx.drawImage(im, 0, 0);
    return cx.getImageData(0, 0, cv.width, cv.height).data;
  }

  function prepararMapa() {
    return fetch(RUTA + "mapa.json").then(function (r) { return r.json(); }).then(function (info) {
      return Promise.all(["base.jpg", "uv.png", "vm.png", "luz.png", "brillo.png"].map(function (n) {
        return cargarImagen(RUTA + n);
      })).then(function (ims) {
        var n = info.w * info.h;
        var uv = pixeles(ims[1]), vm = pixeles(ims[2]), lz = pixeles(ims[3]), br = pixeles(ims[4]);
        var m = {
          info: info, base: ims[0],
          u: new Float32Array(n), v: new Float32Array(n), cob: new Float32Array(n),
          A: new Float32Array(n * 3), B: new Float32Array(n * 3)
        };
        for (var k = 0; k < n; k++) {
          var q = k * 4;
          m.u[k] = ((uv[q] << 8) | uv[q + 1]) / 65535;
          m.v[k] = ((uv[q + 2] << 8) | vm[q]) / 65535;
          m.cob[k] = vm[q + 1] / 255;
          for (var ch = 0; ch < 3; ch++) {
            m.A[k * 3 + ch] = lz[q + ch] / 255 * info.escA;
            m.B[k * 3 + ch] = br[q + ch] / 255 * info.escB;
          }
        }
        mapa = m;
      });
    });
  }

  function proyectar() {
    var inf = mapa.info;
    sctx.drawImage(mapa.base, 0, 0, salida.width, salida.height);
    var dis = pctx.getImageData(0, 0, DW, DH).data;
    var reg = sctx.getImageData(inf.x, inf.y, inf.w, inf.h);
    var d = reg.data, n = inf.w * inf.h, tono = inf.tono;
    // u del mapa es la fracción de la vuelta completa; el diseño cubre (ancho/alto) * k de ella
    var fd = inf.k ? inf.k * DW / DH : 1;
    for (var k = 0; k < n; k++) {
      var cob = mapa.cob[k];
      if (cob <= 0) continue;
      var u = 0.5 - (0.5 - mapa.u[k]) / fd;
      if (u < 0 || u > 1) continue;          // zona sin imprimir, junto al asa
      var fx = u * (DW - 1), fy = mapa.v[k] * (DH - 1);
      var x0 = fx | 0, y0 = fy | 0;
      var x1 = x0 < DW - 1 ? x0 + 1 : x0, y1 = y0 < DH - 1 ? y0 + 1 : y0;
      var ax = fx - x0, ay = fy - y0;
      var p00 = (y0 * DW + x0) * 4, p10 = (y0 * DW + x1) * 4, p01 = (y1 * DW + x0) * 4, p11 = (y1 * DW + x1) * 4;
      var q = k * 4;
      for (var ch = 0; ch < 3; ch++) {
        var lin = (aLineal[dis[p00 + ch]] * (1 - ax) + aLineal[dis[p10 + ch]] * ax) * (1 - ay)
          + (aLineal[dis[p01 + ch]] * (1 - ax) + aLineal[dis[p11 + ch]] * ax) * ay;
        var x = mapa.A[k * 3 + ch] * lin + mapa.B[k * 3 + ch];
        x = x / (1 + tono * x);
        var s = aSRGB[Math.min(4095, (x * 4095) | 0)];
        d[q + ch] = d[q + ch] * (1 - cob) + s * cob;
      }
    }
    sctx.putImageData(reg, inf.x, inf.y);
  }

  var pendiente = false;
  function redibujar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () {
      pendiente = false;
      var p = PLANTILLAS[estado.plantilla];
      if (p.capas && !p.cargado) return;     // se redibuja cuando terminen de cargar sus imágenes
      dibujarPlano(pctx, estado.plantilla);
      vistaPlano.width = 1000; vistaPlano.height = Math.round(1000 * DH / DW);
      vpctx.drawImage(plano, 0, 0, vistaPlano.width, vistaPlano.height);
      if (mapa) proyectar();
    });
  }

  /* ---------- controles ---------- */
  var chipsPlantilla = document.getElementById("plantillas");
  var camposTexto = document.getElementById("campos-texto");
  var bloqueTextos = document.getElementById("bloque-textos");
  var selectorFotos = document.getElementById("selector-fotos");
  var inFoto = document.getElementById("foto");
  var zona = document.getElementById("zona-foto");
  var nombreFoto = document.getElementById("nombre-foto");
  var textoZona = document.getElementById("texto-zona");
  var ajustes = document.getElementById("ajustes-foto");
  var inZoom = document.getElementById("zoom"), inX = document.getElementById("pos-x"), inY = document.getElementById("pos-y");
  var NOTA_FOTO = nombreFoto.textContent;

  function miniaturasDibujadas() {
    var mini = document.createElement("canvas");
    mini.width = 2000; mini.height = 1100;
    var mctx = mini.getContext("2d");
    var guardado = { p: estado.plantilla, t: estado.textos, f: estado.fotos, a: estado.activa };
    estado.textos = []; estado.fotos = []; estado.activa = -1;
    var dw = DW, dh = DH; DW = 2000; DH = 1100;
    chipsPlantilla.querySelectorAll("canvas").forEach(function (cv) {
      estado.plantilla = cv.getAttribute("data-plantilla");
      dibujarPlano(mctx, estado.plantilla);
      cv.getContext("2d").drawImage(mini, 0, 0, cv.width, cv.height);
    });
    DW = dw; DH = dh;
    estado.plantilla = guardado.p; estado.textos = guardado.t; estado.fotos = guardado.f; estado.activa = guardado.a;
  }

  function construirPlantillas() {
    chipsPlantilla.innerHTML = ORDEN.map(function (k) {
      var p = PLANTILLAS[k];
      var vista = p.capas
        ? '<img src="' + p.ruta + p.miniatura + '" alt="" width="420" height="' + Math.round(420 * p.alto / p.ancho) + '" loading="lazy">'
        : '<canvas width="200" height="110" data-plantilla="' + k + '" aria-hidden="true"></canvas>';
      var extra = p.fotos > 1 ? '<small>' + p.fotos + " fotos</small>" : "";
      return '<button type="button" class="plantilla" data-plantilla="' + k + '" aria-pressed="false">' +
        vista + "<span>" + p.nombre + "</span>" + extra + "</button>";
    }).join("");
    chipsPlantilla.addEventListener("click", function (e) {
      var b = e.target.closest(".plantilla");
      if (b) elegirPlantilla(b.getAttribute("data-plantilla"));
    });
  }

  function construirTextos(p) {
    bloqueTextos.hidden = !p.textos.length;
    camposTexto.innerHTML = p.textos.map(function (t, i) {
      var largo = (t.lineas || 1) > 1 || i === 1 || t.tipo === "frase" ? 140 : 32;
      var ayuda = t.tipo === "frase" ? '<small class="ayuda">Mantén «como» y «eres» para que quede con el mismo estilo. Si lo dejas vacío, queda la frase original.</small>' : "";
      return '<label class="campo" for="texto-' + i + '"><span>' + t.etiqueta + "</span>" + ayuda +
        ((t.lineas || 1) > 1
          ? '<textarea id="texto-' + i + '" rows="3" maxlength="' + largo + '" placeholder="' + t.ejemplo.replace(/"/g, "&quot;") + '"></textarea>'
          : '<input type="text" id="texto-' + i + '" maxlength="' + largo + '" autocomplete="off" placeholder="' + t.ejemplo.replace(/"/g, "&quot;") + '">') +
        "</label>";
    }).join("");
  }
  camposTexto.addEventListener("input", function (e) {
    var m = /^texto-(\d+)$/.exec(e.target.id || "");
    if (!m) return;
    estado.textos[+m[1]] = e.target.value.trim();
    redibujar();
  });

  function construirSelectorFotos(p) {
    selectorFotos.hidden = p.fotos < 2;
    if (p.fotos < 2) { selectorFotos.innerHTML = ""; return; }
    var html = "";
    for (var i = 0; i < p.fotos; i++) {
      var f = estado.fotos[i];
      html += '<button type="button" class="chip foto-chip' + (f && f.img ? " lista" : "") + '" data-foto="' + i + '" aria-pressed="' + (i === estado.activa) + '">' +
        (f && f.img ? "✓ " : "") + "Foto " + (i + 1) + "</button>";
    }
    selectorFotos.innerHTML = html;
  }
  selectorFotos.addEventListener("click", function (e) {
    var b = e.target.closest("[data-foto]");
    if (!b) return;
    activarFoto(+b.getAttribute("data-foto"));
  });

  function activarFoto(i) {
    estado.activa = i;
    var p = PLANTILLAS[estado.plantilla];
    construirSelectorFotos(p);
    var f = estado.fotos[i];
    ajustes.hidden = !(f && f.img);
    zona.classList.toggle("con-foto", !!(f && f.img));
    if (f && f.img) {
      inZoom.value = f.zoom; inX.value = f.px; inY.value = f.py;
      nombreFoto.textContent = f.nombre;
      textoZona.innerHTML = "<strong>Cambiar foto" + (p.fotos > 1 ? " " + (i + 1) : "") + "</strong> o arrastra otra aquí";
    } else {
      nombreFoto.textContent = NOTA_FOTO;
      textoZona.innerHTML = "<strong>Elige " + (p.fotos > 1 ? "la foto " + (i + 1) : "una foto") + "</strong> o arrástrala aquí";
    }
    redibujar();
  }

  function elegirPlantilla(k) {
    var p = PLANTILLAS[k];
    estado.plantilla = k;
    estado.textos = [];
    // se conservan las fotos ya subidas, recortadas a los huecos del nuevo prediseño
    estado.fotos = estado.fotos.slice(0, p.fotos);
    if (estado.activa >= p.fotos) estado.activa = 0;
    chipsPlantilla.querySelectorAll(".plantilla").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-plantilla") === k));
    });
    DW = p.capas ? p.ancho : 2000; DH = p.capas ? p.alto : 1100;
    plano.width = DW; plano.height = DH;
    construirTextos(p);
    document.getElementById("aviso-completo").hidden = !p.completo;
    activarFoto(estado.activa);
    if (p.capas && !p.cargado) {
      prepararImagenes(p).then(function () { p.cargado = true; if (estado.plantilla === k) redibujar(); });
    }
  }

  function leerFoto(archivo) {
    if (!archivo || !/^image\//.test(archivo.type)) {
      nombreFoto.textContent = "Ese archivo no es una imagen. Prueba con JPG o PNG.";
      return;
    }
    var i = estado.activa;
    var url = URL.createObjectURL(archivo);
    var im = new Image();
    im.onload = function () {
      // reduce fotos muy grandes para que el diseñador vaya fluido
      var max = 2200, esc = Math.min(1, max / Math.max(im.width, im.height));
      var cv = document.createElement("canvas");
      cv.width = Math.round(im.width * esc); cv.height = Math.round(im.height * esc);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      estado.fotos[i] = { img: cv, zoom: 1, px: 0.5, py: 0.5, nombre: archivo.name };
      // con varias fotos, pasa sola a la siguiente que falte
      var p = PLANTILLAS[estado.plantilla], sig = i;
      for (var k = 1; k <= p.fotos; k++) {
        var cand = (i + k) % p.fotos;
        if (!estado.fotos[cand] || !estado.fotos[cand].img) { sig = cand; break; }
      }
      activarFoto(p.fotos > 1 && sig !== i ? sig : i);
    };
    im.onerror = function () { nombreFoto.textContent = "No pudimos abrir esa imagen. Prueba con otra."; };
    im.src = url;
  }

  inFoto.addEventListener("change", function () { leerFoto(inFoto.files[0]); inFoto.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add("arrastrando"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove("arrastrando"); });
  });
  zona.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) leerFoto(e.dataTransfer.files[0]);
  });

  function ajuste(prop, input) {
    input.addEventListener("input", function () {
      var f = estado.fotos[estado.activa];
      if (!f) return;
      f[prop] = parseFloat(input.value);
      redibujar();
    });
  }
  ajuste("zoom", inZoom); ajuste("px", inX); ajuste("py", inY);

  document.querySelectorAll("[data-vista]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-vista");
      document.querySelectorAll("[data-vista]").forEach(function (o) {
        o.setAttribute("aria-pressed", String(o === b));
      });
      salida.hidden = v !== "taza";
      vistaPlano.hidden = v !== "plano";
    });
  });

  /* ---------- descargar y pedir ---------- */
  function aBlob(cv, tipo, calidad) {
    return new Promise(function (ok) { cv.toBlob(ok, tipo, calidad); });
  }
  function descargar(blob, nombre) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function mensajePedido() {
    var p = PLANTILLAS[estado.plantilla];
    var m = "Hola Anime Emporium, quiero una taza personalizada.\nPrediseño: " + p.nombre;
    p.textos.forEach(function (t, i) { m += "\n" + t.etiqueta + ": " + texto(i); });
    var faltan = 0;
    for (var i = 0; i < p.fotos; i++) if (!estado.fotos[i] || !estado.fotos[i].img) faltan++;
    if (faltan) m += "\n(Me faltan " + faltan + (faltan === 1 ? " foto" : " fotos") + ", te las envío por aquí.)";
    m += "\nTe envío la imagen del diseño.";
    return m;
  }

  var estadoAccion = document.getElementById("estado-accion");

  document.getElementById("btn-descargar").addEventListener("click", function () {
    Promise.all([aBlob(plano, "image/png"), aBlob(salida, "image/jpeg", 0.9)]).then(function (b) {
      descargar(b[0], "anime-emporium-diseno.png");
      setTimeout(function () { descargar(b[1], "anime-emporium-taza.jpg"); }, 400);
      estadoAccion.textContent = "Descargamos el diseño y la vista de tu taza.";
    });
  });

  document.getElementById("btn-pedir").addEventListener("click", function () {
    var texto = mensajePedido();
    aBlob(plano, "image/png").then(function (blob) {
      var archivo = new File([blob], "anime-emporium-diseno.png", { type: "image/png" });
      // En celulares se puede compartir la imagen directo a WhatsApp
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        return navigator.share({ files: [archivo], text: texto }).then(function () {
          estadoAccion.textContent = "Elige el chat de Anime Emporium para enviar tu diseño.";
        }).catch(function () {});
      }
      descargar(blob, "anime-emporium-diseno.png");
      estadoAccion.textContent = "Descargamos tu diseño. Adjúntalo en el chat de WhatsApp que se abrió.";
      window.open("https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(texto), "_blank", "noopener");
    });
  });

  /* ---------- arranque ---------- */
  var fuentes = ["120px 'Lilita One'", "700 120px 'Dancing Script'", "600 50px 'Cormorant Garamond'",
    "100px 'Kalam'", "100px 'Damion'",
    "italic 600 50px 'Cormorant Garamond'", "800 50px Nunito"];
  var listasFuentes = Promise.all(fuentes.map(function (f) { return document.fonts.load(f).catch(function () {}); }));

  fetch("data/predisenos.json").then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
    .then(function (lista) {
      // primero los prediseños de la tienda, después los dibujados
      lista.forEach(function (p) { PLANTILLAS[p.id] = p; ORDEN.push(p.id); });
      Object.keys(PLANTILLAS).forEach(function (k) { if (ORDEN.indexOf(k) === -1) ORDEN.push(k); });
      construirPlantillas();
      elegirPlantilla(ORDEN[0]);
      return listasFuentes;
    })
    .then(function () { miniaturasDibujadas(); redibujar(); });

  prepararMapa().then(redibujar).catch(function () {
    document.getElementById("error-mapa").hidden = false;
  });
})();
