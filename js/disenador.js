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
  var RUTAS = { lados: "assets/img/taza/", frente: "assets/img/taza-frente/" };
  var vista = "lados";

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
    cumple: { nombre: "Cumpleaños", categorias: ["Cumpleaños"], fotos: 1, textos: [
      { etiqueta: "Nombre", ejemplo: "Valentina" }, { etiqueta: "Mensaje", ejemplo: "Que tengas un año lleno de alegría" }] },
    mama: { nombre: "Día de la Madre", categorias: ["Día de la Madre"], fotos: 1, textos: [
      { etiqueta: "Para", ejemplo: "Mamá" }, { etiqueta: "Mensaje", ejemplo: "Gracias por todo tu amor" }] },
    papa: { nombre: "Día del Padre", categorias: ["Día del Padre"], fotos: 1, textos: [
      { etiqueta: "Para", ejemplo: "Papá" }, { etiqueta: "Mensaje", ejemplo: "El mejor del mundo" }] },
    memoria: { nombre: "En memoria", categorias: ["Familia y recuerdos"], fotos: 1, textos: [
      { etiqueta: "Nombre", ejemplo: "Rosa Elena" }, { etiqueta: "Fechas o frase", ejemplo: "1948 – 2025 · Siempre en nuestros corazones" }] },
    foto: { nombre: "Foto y frase", categorias: ["Cumpleaños", "Familia y recuerdos"], fotos: 1, textos: [
      { etiqueta: "Frase", ejemplo: "Los mejores amigos" }, { etiqueta: "Segunda línea", ejemplo: "Desde siempre y para siempre" }] },
    completo: { nombre: "Mi diseño completo", categorias: ["Tu propio diseño"], fotos: 1, textos: [], completo: true }
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
    if (p._carga) return p._carga;
    var cargas = p.capas.filter(function (c) { return c.img; }).map(function (c) {
      return cargarImagen(p.ruta + c.img).then(function (im) { c.imagen = im; });
    });
    if (p.personaje) {
      cargas.push(cargarImagen(p.ruta + p.personaje.ejemplo).then(function (im) { p.ejemploImg = im; }));
    }
    (p.textos || []).forEach(function (t) {
      (t.originales || []).forEach(function (o) {
        cargas.push(cargarImagen(p.ruta + o.img).then(function (im) { o.imagen = im; }));
      });
    });
    p._carga = Promise.all(cargas);
    return p._carga;
  }

  function trazarForma(ctx, f) {
    ctx.beginPath();
    if (f.tipo === "quad" || f.tipo === "caja") {
      ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (var i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
      ctx.closePath();
    } else {
      ctx.ellipse(f.cx, f.cy, f.rx, f.ry, f.ang * Math.PI / 180, 0, Math.PI * 2);
    }
  }

  // Marco orientado del hueco: centro, ángulo y tamaño, para encuadrar la foto derecha dentro de él
  function marcoDe(f) {
    if (f.tipo === "quad" || f.tipo === "caja") {
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

  // Personaje recortado (ej. el Pokémon del cliente): se ajusta dentro de su caja sin deformarlo.
  function imagenPersonaje(p) {
    var f = estado.fotos[0];
    if (f && f.recorte) return f.recorte;
    return p.ejemploImg || null;
  }
  function cajaAjustada(img, caja, ancla, margen) {
    var x = caja[0], y = caja[1], w = caja[2], h = caja[3];
    var mw = w * (1 - 2 * (margen || 0)), mh = h * (1 - 2 * (margen || 0));
    var f = estado.fotos[0], zoom = f && f.recorte ? f.zoom : 1;
    var esc = Math.min(mw / img.width, mh / img.height) * zoom;
    var iw = img.width * esc, ih = img.height * esc;
    var dx = (f && f.recorte ? (f.px - 0.5) : 0) * w, dy = (f && f.recorte ? (f.py - 0.5) : 0) * h;
    var ix = x + (w - iw) / 2 + dx;
    var iy = (ancla === "abajo" ? y + h - ih - (h - mh) / 2 : y + (h - ih) / 2) + dy;
    return { x: ix, y: iy, w: iw, h: ih };
  }
  function dibujarSombra(ctx, img, r) {
    // silueta aplastada en el suelo, como la sombra del PSD original
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(r.w)); cv.height = Math.max(1, Math.round(r.h));
    var c2 = cv.getContext("2d");
    c2.drawImage(img, 0, 0, cv.width, cv.height);
    c2.globalCompositeOperation = "source-in";
    c2.fillStyle = "rgba(20, 30, 40, 1)"; c2.fillRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.globalAlpha = 0.32;
    try { ctx.filter = "blur(" + Math.round(r.h * 0.03) + "px)"; } catch (e) {}
    ctx.translate(r.x + r.w * 0.5, r.y + r.h);
    ctx.transform(1, 0, -0.9, 0.2, 0, 0);
    ctx.drawImage(cv, -r.w * 0.5, -r.h, r.w, r.h);
    ctx.restore();
  }

  function dibujarImagen(ctx, p) {
    var img = p.personaje ? imagenPersonaje(p) : null;
    p.capas.forEach(function (c) {
      if (c.personaje != null) {
        if (img) { var r = cajaAjustada(img, c.caja, c.ancla, c.margen); ctx.drawImage(img, r.x, r.y, r.w, r.h); }
      } else if (c.sombra != null) {
        if (img) dibujarSombra(ctx, img, cajaAjustada(img, c.caja, "abajo", 0));
      } else if (c.color) {
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
  var mapa = null, mapas = {};
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

  function prepararMapa(cual) {
    if (mapas[cual]) return mapas[cual];
    var RUTA = RUTAS[cual];
    mapas[cual] = fetch(RUTA + "mapa.json").then(function (r) { return r.json(); }).then(function (info) {
      return Promise.all(["base.jpg", "uv.png", "vm.png", "luz.png", "brillo.png", "partes.png"].map(function (n) {
        return cargarImagen(RUTA + n).catch(function () { return null; });
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
        if (ims[5]) {
          var pc = document.createElement("canvas"); pc.width = salida.width; pc.height = salida.height;
          var px = pc.getContext("2d"); px.drawImage(ims[5], 0, 0, pc.width, pc.height);
          m.partes = px.getImageData(0, 0, pc.width, pc.height).data;
        }
        return m;
      });
    });
    return mapas[cual];
  }
  function usarVista(cual) {
    vista = cual;
    if (cual === "plano") return;
    prepararMapa(cual).then(function (m) { if (vista === cual) { mapa = m; redibujar(); } })
      .catch(function () { document.getElementById("error-mapa").hidden = false; });
  }

  function proyectar() {
    var inf = mapa.info;
    sctx.drawImage(baseTenida(mapa), 0, 0, salida.width, salida.height);
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
  var selectorFotos = document.getElementById("selector-fotos");
  var inFoto = document.getElementById("foto");
  var zona = document.getElementById("zona-foto");
  var nombreFoto = document.getElementById("nombre-foto");
  var textoZona = document.getElementById("texto-zona");
  var ajustes = document.getElementById("ajustes-foto");
  var inZoom = document.getElementById("zoom"), inX = document.getElementById("pos-x"), inY = document.getElementById("pos-y");
  var NOTA_FOTO = nombreFoto.textContent;
  var chipsGrupos = document.getElementById("grupos");
  var chipsSub = document.getElementById("subcategorias");
  var guiaPersonaje = document.getElementById("guia-personaje");
  var ajusteFondo = document.getElementById("ajuste-fondo");
  var inFondo = document.getElementById("quitar-fondo"), inTolerancia = document.getElementById("tolerancia");
  var avisoListo = document.getElementById("aviso-listo");
  // Grupos del filtro: cada uno junta varias categorías para que la lista no se vea desordenada
  var OCASIONES = ["Día de la Madre", "Día del Padre", "Cumpleaños", "Familia y recuerdos", "Tu propio diseño"];
  var DEPORTES = ["Fútbol chileno"];
  var GRUPOS = [
    { id: "todos", nombre: "Todos" },
    { id: "foto", nombre: "Con foto" },
    { id: "ocasiones", nombre: "Ocasiones", cats: function (c) { return OCASIONES.indexOf(c) !== -1; } },
    { id: "series", nombre: "Anime", cats: function (c) { return OCASIONES.indexOf(c) === -1 && DEPORTES.indexOf(c) === -1; } },
    { id: "futbol", nombre: "Fútbol", cats: function (c) { return DEPORTES.indexOf(c) !== -1; } }
  ];
  var filtro = { grupo: "todos", sub: null };

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

  function grupo(id) { return GRUPOS.filter(function (g) { return g.id === id; })[0]; }
  function enGrupo(p, g) {
    if (g.id === "todos") return true;
    if (g.id === "foto") return p.fotos > 0;
    return (p.categorias || []).some(g.cats);
  }
  function subcategoriasDe(g) {
    if (!g.cats) return [];
    var cuenta = {};
    ORDEN.forEach(function (k) {
      (PLANTILLAS[k].categorias || []).filter(g.cats).forEach(function (c) { cuenta[c] = (cuenta[c] || 0) + 1; });
    });
    var lista = Object.keys(cuenta);
    lista.sort(function (a, b) {
      var ia = OCASIONES.indexOf(a), ib = OCASIONES.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b, "es");
    });
    return lista.map(function (c) { return { nombre: c, n: cuenta[c] }; });
  }
  function construirFiltros() {
    chipsGrupos.innerHTML = GRUPOS.map(function (g) {
      var n = ORDEN.filter(function (k) { return enGrupo(PLANTILLAS[k], g); }).length;
      if (!n) return "";
      return '<button type="button" class="grupo" role="tab" data-grupo="' + g.id + '" aria-selected="' + (g.id === filtro.grupo) + '">' +
        g.nombre + ' <small>' + n + "</small></button>";
    }).join("");
    var subs = subcategoriasDe(grupo(filtro.grupo));
    chipsSub.hidden = subs.length < 2;
    chipsSub.innerHTML = subs.length < 2 ? "" : ['<button type="button" class="chip" data-sub="" aria-pressed="' + !filtro.sub + '">Todas</button>'].concat(
      subs.map(function (c) {
        return '<button type="button" class="chip" data-sub="' + c.nombre + '" aria-pressed="' + (c.nombre === filtro.sub) + '">' + c.nombre + ' <small>' + c.n + "</small></button>";
      })).join("");
  }
  chipsGrupos.addEventListener("click", function (e) {
    var b = e.target.closest("[data-grupo]");
    if (!b) return;
    filtro.grupo = b.getAttribute("data-grupo"); filtro.sub = null;
    construirFiltros(); filtrarPlantillas();
  });
  chipsSub.addEventListener("click", function (e) {
    var b = e.target.closest("[data-sub]");
    if (!b) return;
    filtro.sub = b.getAttribute("data-sub") || null;
    construirFiltros(); filtrarPlantillas();
  });
  function pasaFiltro(p) {
    if (!enGrupo(p, grupo(filtro.grupo))) return false;
    return !filtro.sub || (p.categorias || []).indexOf(filtro.sub) !== -1;
  }
  function filtrarPlantillas() {
    chipsPlantilla.querySelectorAll(".plantilla").forEach(function (b) {
      b.hidden = !pasaFiltro(PLANTILLAS[b.getAttribute("data-plantilla")]);
    });
  }

  function construirPlantillas() {
    construirFiltros();
    chipsPlantilla.innerHTML = ORDEN.map(function (k) {
      var p = PLANTILLAS[k];
      var vista = p.capas
        ? '<img src="' + p.ruta + p.miniatura + '" alt="" width="420" height="' + Math.round(420 * p.alto / p.ancho) + '" loading="lazy">'
        : '<canvas width="200" height="110" data-plantilla="' + k + '" aria-hidden="true"></canvas>';
      var extra = p.fotos > 1 ? '<small>' + p.fotos + " fotos</small>" : p.personaje ? "<small>Sube tu personaje</small>" : p.fotos === 0 ? '<small class="listo">Diseño listo</small>' : "";
      return '<button type="button" class="plantilla" data-plantilla="' + k + '" aria-pressed="false">' +
        vista + "<span>" + p.nombre + "</span>" + extra + "</button>";
    }).join("");
    chipsPlantilla.addEventListener("click", function (e) {
      var b = e.target.closest(".plantilla");
      if (b) { elegirPlantilla(b.getAttribute("data-plantilla")); siguientePaso("diseno"); }
    });
    filtrarPlantillas();
  }

  function construirTextos(p) {
    camposTexto.innerHTML = p.textos.map(function (t, i) {
      var largo = t.max_largo || ((t.lineas || 1) > 1 || i === 1 || t.tipo === "frase" ? 140 : 32);
      var textoAyuda = t.ayuda || (t.tipo === "frase" && /como/.test(t.patron || "")
        ? "Mantén «como» y «eres» para que quede con el mismo estilo. Si lo dejas vacío, queda la frase original." : "");
      var ayuda = textoAyuda ? '<small class="ayuda">' + textoAyuda + "</small>" : "";
      return '<label class="campo" for="texto-' + i + '"><span>' + t.etiqueta + "</span>" + ayuda +
        ((t.lineas || 1) > 1
          ? '<textarea id="texto-' + i + '" rows="3" maxlength="' + largo + '" placeholder="' + t.ejemplo.replace(/"/g, "&quot;") + '"></textarea>'
          : '<input type="text" id="texto-' + i + '" maxlength="' + largo + '" autocomplete="off"' + (t.numerico ? ' inputmode="numeric"' : "") + ' placeholder="' + t.ejemplo.replace(/"/g, "&quot;") + '">') +
        "</label>";
    }).join("");
  }
  camposTexto.addEventListener("input", function (e) {
    var m = /^texto-(\d+)$/.exec(e.target.id || "");
    if (!m) return;
    estado.textos[+m[1]] = e.target.value.trim();
    actualizarResumenes();
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
      textoZona.innerHTML = "<strong>Cambiar " + (p.personaje ? "imagen" : "foto" + (p.fotos > 1 ? " " + (i + 1) : "")) + "</strong> o arrastra otra aquí";
    } else {
      nombreFoto.textContent = NOTA_FOTO;
      textoZona.innerHTML = p.personaje ? "<strong>Sube la imagen de tu personaje</strong> o arrástrala aquí"
        : "<strong>Elige " + (p.fotos > 1 ? "la foto " + (i + 1) : "una foto") + "</strong> o arrástrala aquí";
    }
    ajusteFondo.hidden = !(p.personaje && f && f.img);
    actualizarResumenes();
    redibujar();
  }

  function elegirPlantilla(k) {
    var p = PLANTILLAS[k];
    estado.plantilla = k;
    estado.textos = [];
    // se conservan las fotos ya subidas, recortadas a los huecos del nuevo prediseño
    var antes = PLANTILLAS[estado.anterior];
    estado.fotos = (antes && !!antes.personaje !== !!p.personaje) ? [] : estado.fotos.slice(0, p.fotos);
    estado.anterior = k;
    if (estado.activa >= p.fotos) estado.activa = 0;
    chipsPlantilla.querySelectorAll(".plantilla").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-plantilla") === k));
    });
    DW = p.capas ? p.ancho : 2000; DH = p.capas ? p.alto : 1100;
    plano.width = DW; plano.height = DH;
    construirTextos(p);
    document.getElementById("aviso-completo").hidden = !p.completo;
    avisoListo.hidden = p.fotos !== 0 || p.textos.length > 0;
    guiaPersonaje.hidden = !p.personaje;
    document.getElementById("titulo-fotos").textContent = p.personaje ? "Sube tu personaje" : p.fotos > 1 ? "Sube tus fotos" : "Sube tu foto";
    if (p.personaje) {
      guiaPersonaje.querySelector(".guia-bien").src = p.ruta + p.personaje.guia_bien;
      guiaPersonaje.querySelector(".guia-mal").src = p.ruta + p.personaje.guia_mal;
    }
    document.getElementById("titulo-texto").textContent = p.textos.length === 1 && p.textos[0].numerico ? "Elige el número" : "Escribe tu mensaje";
    prepararPasos(p);
    try { history.replaceState(null, "", "?diseno=" + encodeURIComponent(k)); } catch (e) {}
    activarFoto(estado.activa);
    if (p.capas && !p.cargado) {
      prepararImagenes(p).then(function () { p.cargado = true; if (estado.plantilla === k) redibujar(); });
    }
  }

  /* ---------- pasos desplegables ---------- */
  var acordeon = document.getElementById("acordeon");
  var PASOS = ["diseno", "color", "fotos", "texto", "pedir"];
  function pasoEl(id) { return acordeon.querySelector('[data-paso="' + id + '"]'); }
  function pasosVisibles() { return PASOS.filter(function (id) { return !pasoEl(id).hidden; }); }
  function prepararPasos(p) {
    pasoEl("fotos").hidden = p.fotos === 0;
    pasoEl("texto").hidden = !p.textos.length;
    pasoEl("color").hidden = colores.length < 2;
    pasosVisibles().forEach(function (id, i) { pasoEl(id).querySelector(".paso-n").textContent = i + 1; });
  }
  function abrirPaso(id, desplazar) {
    PASOS.forEach(function (otro) {
      var el = pasoEl(otro), abierto = otro === id;
      el.classList.toggle("abierto", abierto);
      el.querySelector(".paso-cab").setAttribute("aria-expanded", String(abierto));
      el.querySelector(".paso-cuerpo").hidden = !abierto;
    });
    if (id === "pedir") llenarResumenPedido();
    if (desplazar) {
      var el = pasoEl(id);
      requestAnimationFrame(function () {
        var r = el.getBoundingClientRect();
        if (r.top < 70 || r.top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
  function siguientePaso(desde) {
    var v = pasosVisibles(), i = v.indexOf(desde);
    if (i !== -1 && i < v.length - 1) abrirPaso(v[i + 1], true);
  }
  acordeon.addEventListener("click", function (e) {
    var cab = e.target.closest(".paso-cab");
    if (cab) {
      var id = cab.parentNode.getAttribute("data-paso");
      abrirPaso(cab.getAttribute("aria-expanded") === "true" ? null : id, false);
      return;
    }
    var seguir = e.target.closest("[data-seguir]");
    if (seguir) siguientePaso(seguir.closest(".paso").getAttribute("data-paso"));
  });

  /* ---------- color del asa y el interior ---------- */
  var colores = (cfg.coloresTaza && cfg.coloresTaza.length) ? cfg.coloresTaza : [{ nombre: "Blanca", color: "#ffffff", disponible: true }];
  estado.color = colores[0];
  var cajaColores = document.getElementById("colores");
  cajaColores.innerHTML = colores.map(function (c, i) {
    return '<button type="button" class="color" role="radio" data-color="' + i + '" aria-checked="' + (i === 0) + '"' +
      (c.disponible === false ? ' disabled aria-disabled="true"' : "") + '>' +
      '<span class="muestra" style="background:' + c.color + '"></span><span>' + c.nombre + "</span>" +
      (c.disponible === false ? "<small>Pronto</small>" : "") + "</button>";
  }).join("");
  cajaColores.addEventListener("click", function (e) {
    var b = e.target.closest("[data-color]");
    if (!b || b.disabled) return;
    estado.color = colores[+b.getAttribute("data-color")];
    cajaColores.querySelectorAll("[data-color]").forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
    actualizarResumenes();
    redibujar();
  });
  // Pinta asa e interior sobre la taza base usando la máscara partes.png (R = asa, G = interior)
  var basesTenidas = {};
  function baseTenida(m) {
    var hex = estado.color.color.toLowerCase();
    if (hex === "#ffffff" || !m.partes) return m.base;
    var clave = m.info.x + ":" + hex;
    if (basesTenidas[clave]) return basesTenidas[clave];
    var w = salida.width, h = salida.height;
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var cx = cv.getContext("2d"); cx.drawImage(m.base, 0, 0, w, h);
    var img = cx.getImageData(0, 0, w, h), d = img.data, mk = m.partes;
    var cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
    for (var k = 0; k < w * h; k++) {
      var a = Math.max(mk[k * 4], mk[k * 4 + 1]) / 255;
      if (!a) continue;
      var q = k * 4, L = (d[q] * 0.3 + d[q + 1] * 0.59 + d[q + 2] * 0.11) / 255;
      // el blanco de la base pasa a ser el color; los brillos fuertes se mantienen claros
      var t = Math.min(1, L / 0.86), brillo = Math.max(0, (L - 0.9) / 0.1);
      var r = cr * t, g = cg * t, b = cb * t;
      r += (255 - r) * brillo * 0.85; g += (255 - g) * brillo * 0.85; b += (255 - b) * brillo * 0.85;
      d[q] = d[q] * (1 - a) + r * a; d[q + 1] = d[q + 1] * (1 - a) + g * a; d[q + 2] = d[q + 2] * (1 - a) + b * a;
    }
    cx.putImageData(img, 0, 0);
    basesTenidas[clave] = cv;
    return cv;
  }

  /* ---------- resúmenes ---------- */
  function actualizarResumenes() {
    var p = PLANTILLAS[estado.plantilla];
    if (!p) return;
    document.getElementById("resumen-diseno").textContent = p.nombre;
    document.getElementById("resumen-color").textContent = estado.color.nombre === "Blanca" ? "Toda blanca" : "Asa e interior " + estado.color.nombre.toLowerCase();
    var subidas = 0;
    for (var i = 0; i < p.fotos; i++) if (estado.fotos[i] && estado.fotos[i].img) subidas++;
    document.getElementById("resumen-fotos").textContent = p.fotos ? (p.personaje ? (subidas ? "Personaje listo" : "Falta tu personaje") : subidas + " de " + p.fotos + (p.fotos === 1 ? " foto" : " fotos")) : "";
    var escritos = estado.textos.filter(function (t) { return t; }).length;
    document.getElementById("resumen-texto").textContent = p.textos.length ? (escritos ? "Personalizado" : "Texto de ejemplo") : "";
  }
  function llenarResumenPedido() {
    var p = PLANTILLAS[estado.plantilla], filas = [["Diseño", p.nombre]];
    if (colores.length > 1) filas.push(["Color", document.getElementById("resumen-color").textContent]);
    if (p.fotos) filas.push([p.personaje ? "Personaje" : "Fotos", document.getElementById("resumen-fotos").textContent]);
    p.textos.forEach(function (t, i) { filas.push([t.etiqueta, texto(i)]); });
    document.getElementById("resumen-pedido").innerHTML = filas.map(function (f) {
      return "<dt>" + f[0] + "</dt><dd>" + String(f[1]).replace(/[<>&]/g, "") + "</dd>";
    }).join("");
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
      if (PLANTILLAS[estado.plantilla].personaje) recortarPersonaje(estado.fotos[i]);
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

  /* ---------- quitar fondo liso (sin servicios externos) ----------
     Si la imagen ya trae transparencia, se usa tal cual. Si no, se toma el color de los bordes
     y se borra por relleno desde afuera todo lo que se le parezca. Funciona con fondos de un color. */
  function recortarPersonaje(f) {
    var src = f.img, W = src.width, H = src.height;
    var esc = Math.min(1, 1400 / Math.max(W, H));
    var w = Math.max(1, Math.round(W * esc)), h = Math.max(1, Math.round(H * esc));
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var cx = cv.getContext("2d"); cx.drawImage(src, 0, 0, w, h);
    var data = cx.getImageData(0, 0, w, h), d = data.data;
    var transp = 0, borde = [];
    for (var x = 0; x < w; x++) { borde.push(x, (h - 1) * w + x); }
    for (var y = 0; y < h; y++) { borde.push(y * w, y * w + w - 1); }
    borde.forEach(function (k) { if (d[k * 4 + 3] < 200) transp++; });
    f.traiaTransparencia = transp > borde.length * 0.5;
    if (inFondo.checked && !f.traiaTransparencia) {
      // color de fondo: el más repetido en el borde (cuantizado)
      var cuenta = {}, mejor = null, nm = 0;
      borde.forEach(function (k) {
        var q = (d[k * 4] >> 4) + "," + (d[k * 4 + 1] >> 4) + "," + (d[k * 4 + 2] >> 4);
        cuenta[q] = (cuenta[q] || 0) + 1;
        if (cuenta[q] > nm) { nm = cuenta[q]; mejor = k; }
      });
      var fr = d[mejor * 4], fg = d[mejor * 4 + 1], fb = d[mejor * 4 + 2];
      var tol = parseFloat(inTolerancia.value), tol2 = tol * tol, suave2 = (tol * 1.6) * (tol * 1.6);
      var visto = new Uint8Array(w * h), pila = [];
      function dist2(k) { var a = d[k * 4] - fr, b = d[k * 4 + 1] - fg, c = d[k * 4 + 2] - fb; return a * a + b * b + c * c; }
      borde.forEach(function (k) { if (!visto[k] && dist2(k) <= suave2) { visto[k] = 1; pila.push(k); } });
      while (pila.length) {
        var k = pila.pop(), dd = dist2(k);
        // dentro de la tolerancia: transparente; en el borde de la tolerancia: semitransparente (antialias)
        var a = dd <= tol2 ? 0 : Math.min(1, (Math.sqrt(dd) - tol) / (tol * 0.6));
        d[k * 4 + 3] = Math.round(d[k * 4 + 3] * a);
        if (dd > tol2) continue;
        var px = k % w, py = (k / w) | 0;
        if (px > 0 && !visto[k - 1] && dist2(k - 1) <= suave2) { visto[k - 1] = 1; pila.push(k - 1); }
        if (px < w - 1 && !visto[k + 1] && dist2(k + 1) <= suave2) { visto[k + 1] = 1; pila.push(k + 1); }
        if (py > 0 && !visto[k - w] && dist2(k - w) <= suave2) { visto[k - w] = 1; pila.push(k - w); }
        if (py < h - 1 && !visto[k + w] && dist2(k + w) <= suave2) { visto[k + w] = 1; pila.push(k + w); }
      }
      cx.putImageData(data, 0, 0);
    }
    // recorta al contenido visible
    var x0 = w, y0 = h, x1 = -1, y1 = -1, dd2 = cx.getImageData(0, 0, w, h).data;
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      if (dd2[(yy * w + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    var out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    f.recorte = out;
    var nota = document.getElementById("nota-fondo");
    nota.textContent = f.traiaTransparencia ? "Tu imagen ya venía sin fondo." :
      inFondo.checked ? "Quitamos el fondo. Si se borró parte del personaje, baja la sensibilidad." : "Fondo original.";
  }
  [inFondo, inTolerancia].forEach(function (el) {
    el.addEventListener("input", function () {
      var f = estado.fotos[0];
      if (f && f.img && PLANTILLAS[estado.plantilla].personaje) { recortarPersonaje(f); redibujar(); }
    });
  });

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
      salida.hidden = v === "plano";
      vistaPlano.hidden = v !== "plano";
      usarVista(v);
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
    var m = "Hola Anime Emporium, quiero una taza" + (p.fotos === 0 ? "" : " personalizada") + ".\n" +
      (p.fotos === 0 ? "Diseño: " : "Prediseño: ") + p.nombre + " (" + estado.plantilla + ")";
    if (colores.length > 1) m += "\nColor de asa e interior: " + estado.color.nombre;
    p.textos.forEach(function (t, i) { m += "\n" + t.etiqueta + ": " + texto(i); });
    var faltan = 0;
    for (var i = 0; i < p.fotos; i++) if (!estado.fotos[i] || !estado.fotos[i].img) faltan++;
    if (faltan && !p.personaje) m += "\n(Me faltan " + faltan + (faltan === 1 ? " foto" : " fotos") + ", te las envío por aquí.)";
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
      lista.sort(function (a, b) { return (b.fotos > 0) - (a.fotos > 0); });
      lista.forEach(function (p) { PLANTILLAS[p.id] = p; ORDEN.push(p.id); });
      Object.keys(PLANTILLAS).forEach(function (k) { if (ORDEN.indexOf(k) === -1) ORDEN.push(k); });
      var q = new URLSearchParams(location.search);
      var pedido = q.get("diseno"), cat = q.get("categoria");
      if (cat) {
        var g = GRUPOS.filter(function (g) { return g.cats && g.cats(cat); })[0];
        if (g) { filtro.grupo = g.id; filtro.sub = cat; }
      }
      construirPlantillas();
      var primero = ORDEN.filter(function (k) { return pasaFiltro(PLANTILLAS[k]); })[0] || ORDEN[0];
      elegirPlantilla(pedido && PLANTILLAS[pedido] ? pedido : primero);
      var sel = chipsPlantilla.querySelector('[aria-pressed="true"]');
      if (sel && pedido) sel.scrollIntoView({ block: "nearest" });
      return listasFuentes;
    })
    .then(function () { miniaturasDibujadas(); redibujar(); });

  usarVista("lados");
  abrirPaso("diseno", false);
})();
