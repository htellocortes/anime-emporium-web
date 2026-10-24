/* Diseñador de tazas personalizadas.
   El cliente elige un prediseño, sube su foto y escribe sus textos.
   El diseño plano (2000 x 1100, proporción de la plantilla de sublimado) se pinta en un canvas
   y se proyecta sobre la taza 3D usando los mapas generados por herramientas/taza3d.py --mapas.
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
    plantilla: "cumple",
    foto: null,
    zoom: 1, px: 0.5, py: 0.5,
    texto1: "", texto2: ""
  };

  /* ---------- prediseños ---------- */
  var PLANTILLAS = {
    cumple: {
      nombre: "Cumpleaños",
      t1: "Valentina", t2: "Que tengas un año lleno de alegría",
      e1: "Nombre", e2: "Mensaje"
    },
    mama: {
      nombre: "Día de la Madre",
      t1: "Mamá", t2: "Gracias por todo tu amor",
      e1: "Para", e2: "Mensaje"
    },
    papa: {
      nombre: "Día del Padre",
      t1: "Papá", t2: "El mejor del mundo",
      e1: "Para", e2: "Mensaje"
    },
    memoria: {
      nombre: "En memoria",
      t1: "Rosa Elena", t2: "1948 – 2025 · Siempre en nuestros corazones",
      e1: "Nombre", e2: "Fechas o frase"
    },
    foto: {
      nombre: "Foto y frase",
      t1: "Los mejores amigos", t2: "Desde siempre y para siempre",
      e1: "Frase", e2: "Segunda línea"
    },
    completo: {
      nombre: "Mi diseño completo",
      t1: "", t2: "", e1: "", e2: "", sinTexto: true
    }
  };

  // generador pseudoaleatorio con semilla fija, para que el confeti no cambie en cada redibujo
  function azar(semilla) {
    var s = semilla;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function textoAjustado(ctx, texto, x, y, maxAncho, tamano, fuente, alinear) {
    var t = tamano;
    ctx.font = fuente.replace("{t}", t);
    while (ctx.measureText(texto).width > maxAncho && t > 20) {
      t -= 4; ctx.font = fuente.replace("{t}", t);
    }
    ctx.textAlign = alinear || "center";
    ctx.fillText(texto, x, y);
    return t;
  }

  function lineas(ctx, texto, maxAncho) {
    var palabras = texto.split(/\s+/), out = [], linea = "";
    palabras.forEach(function (p) {
      var prueba = linea ? linea + " " + p : p;
      if (ctx.measureText(prueba).width > maxAncho && linea) { out.push(linea); linea = p; }
      else linea = prueba;
    });
    if (linea) out.push(linea);
    return out.slice(0, 3);
  }

  function parrafo(ctx, texto, x, y, maxAncho, alto, alinear) {
    ctx.textAlign = alinear || "center";
    lineas(ctx, texto, maxAncho).forEach(function (l, i) { ctx.fillText(l, x, y + i * alto); });
  }

  // dibuja la foto (o un marcador) recortada a la forma actual del contexto
  function foto(ctx, x, y, w, h) {
    if (estado.foto) {
      var img = estado.foto;
      var esc = Math.max(w / img.width, h / img.height) * estado.zoom;
      var iw = img.width * esc, ih = img.height * esc;
      var dx = x + (w - iw) * estado.px;
      var dy = y + (h - ih) * estado.py;
      ctx.drawImage(img, dx, dy, iw, ih);
    } else {
      var g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "#d9d3e8"); g.addColorStop(1, "#b9b0d0");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#958bb3";
      var r = Math.min(w, h);
      ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.40, r * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.86, r * 0.32, r * 0.25, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#6e6490";
      ctx.font = "800 " + Math.round(r * 0.075) + "px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Tu foto aquí", x + w / 2, y + h * 0.66);
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

  function dibujarPlano(ctx, plantilla) {
    var p = PLANTILLAS[plantilla];
    ctx.save();
    ctx.clearRect(0, 0, DW, DH);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, DW, DH);
    DIBUJO[plantilla](ctx, estado.texto1 || p.t1, estado.texto2 || p.t2);
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

  function cargarImagen(src) {
    return new Promise(function (ok, mal) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = mal;
      im.src = src;
    });
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
    for (var k = 0; k < n; k++) {
      var cob = mapa.cob[k];
      if (cob <= 0) continue;
      var fx = mapa.u[k] * (DW - 1), fy = mapa.v[k] * (DH - 1);
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
      dibujarPlano(pctx, estado.plantilla);
      vpctx.clearRect(0, 0, vistaPlano.width, vistaPlano.height);
      vpctx.drawImage(plano, 0, 0, vistaPlano.width, vistaPlano.height);
      if (mapa) proyectar();
    });
  }

  /* ---------- controles ---------- */
  var chipsPlantilla = document.getElementById("plantillas");
  var inT1 = document.getElementById("texto1"), inT2 = document.getElementById("texto2");
  var lbT1 = document.getElementById("lbl-texto1"), lbT2 = document.getElementById("lbl-texto2");
  var bloqueTextos = document.getElementById("bloque-textos");
  var inFoto = document.getElementById("foto");
  var zona = document.getElementById("zona-foto");
  var nombreFoto = document.getElementById("nombre-foto");
  var ajustes = document.getElementById("ajustes-foto");
  var inZoom = document.getElementById("zoom"), inX = document.getElementById("pos-x"), inY = document.getElementById("pos-y");

  function miniaturas() {
    var mini = document.createElement("canvas");
    mini.width = DW; mini.height = DH;
    var mctx = mini.getContext("2d");
    var guardado = { t1: estado.texto1, t2: estado.texto2 };
    estado.texto1 = ""; estado.texto2 = "";
    chipsPlantilla.querySelectorAll("canvas").forEach(function (cv) {
      dibujarPlano(mctx, cv.getAttribute("data-plantilla"));
      cv.getContext("2d").drawImage(mini, 0, 0, cv.width, cv.height);
    });
    estado.texto1 = guardado.t1; estado.texto2 = guardado.t2;
  }

  function construirPlantillas() {
    chipsPlantilla.innerHTML = Object.keys(PLANTILLAS).map(function (k) {
      return '<button type="button" class="plantilla" data-plantilla="' + k + '" aria-pressed="' + (k === estado.plantilla) + '">' +
        '<canvas width="200" height="110" data-plantilla="' + k + '" aria-hidden="true"></canvas>' +
        "<span>" + PLANTILLAS[k].nombre + "</span></button>";
    }).join("");
    chipsPlantilla.addEventListener("click", function (e) {
      var b = e.target.closest(".plantilla");
      if (!b) return;
      elegirPlantilla(b.getAttribute("data-plantilla"));
    });
  }

  function elegirPlantilla(k) {
    estado.plantilla = k;
    chipsPlantilla.querySelectorAll(".plantilla").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-plantilla") === k));
    });
    var p = PLANTILLAS[k];
    // cada prediseño parte con sus textos de ejemplo (los campos significan cosas distintas)
    estado.texto1 = ""; estado.texto2 = "";
    inT1.value = ""; inT2.value = "";
    bloqueTextos.hidden = !!p.sinTexto;
    lbT1.textContent = p.e1; lbT2.textContent = p.e2;
    inT1.placeholder = p.t1; inT2.placeholder = p.t2;
    document.getElementById("aviso-completo").hidden = k !== "completo";
    redibujar();
  }

  function leerFoto(archivo) {
    if (!archivo || !/^image\//.test(archivo.type)) {
      nombreFoto.textContent = "Ese archivo no es una imagen. Prueba con JPG o PNG.";
      return;
    }
    var url = URL.createObjectURL(archivo);
    cargarImagen(url).then(function (im) {
      // reduce fotos muy grandes para que el diseñador vaya fluido
      var max = 2200, esc = Math.min(1, max / Math.max(im.width, im.height));
      var cv = document.createElement("canvas");
      cv.width = Math.round(im.width * esc); cv.height = Math.round(im.height * esc);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      estado.foto = cv;
      estado.zoom = 1; estado.px = 0.5; estado.py = 0.5;
      inZoom.value = 1; inX.value = 0.5; inY.value = 0.5;
      nombreFoto.textContent = archivo.name;
      zona.classList.add("con-foto");
      ajustes.hidden = false;
      redibujar();
    }).catch(function () {
      nombreFoto.textContent = "No pudimos abrir esa imagen. Prueba con otra.";
    });
  }

  inFoto.addEventListener("change", function () { leerFoto(inFoto.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add("arrastrando"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove("arrastrando"); });
  });
  zona.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) leerFoto(e.dataTransfer.files[0]);
  });

  inT1.addEventListener("input", function () { estado.texto1 = inT1.value.trim(); redibujar(); });
  inT2.addEventListener("input", function () { estado.texto2 = inT2.value.trim(); redibujar(); });
  inZoom.addEventListener("input", function () { estado.zoom = parseFloat(inZoom.value); redibujar(); });
  inX.addEventListener("input", function () { estado.px = parseFloat(inX.value); redibujar(); });
  inY.addEventListener("input", function () { estado.py = parseFloat(inY.value); redibujar(); });

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
    if (!p.sinTexto) {
      m += "\n" + p.e1 + ": " + (estado.texto1 || p.t1);
      m += "\n" + p.e2 + ": " + (estado.texto2 || p.t2);
    }
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
  construirPlantillas();
  elegirPlantilla(estado.plantilla);
  var fuentes = ["120px 'Lilita One'", "700 120px 'Dancing Script'", "600 50px 'Cormorant Garamond'", "800 50px Nunito"];
  Promise.all(fuentes.map(function (f) { return document.fonts.load(f).catch(function () {}); }))
    .then(function () { miniaturas(); redibujar(); });
  prepararMapa().then(redibujar).catch(function () {
    document.getElementById("error-mapa").hidden = false;
  });
})();
