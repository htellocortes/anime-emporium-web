(function () {
  "use strict";

  var cfg = window.AE_CONFIG || {};
  var pagina = document.body.getAttribute("data-pagina");

  /* ---------- utilidades ---------- */
  function waLink(mensaje) {
    return "https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(mensaje);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function formatoPrecio(p) {
    return p == null ? "Precio a consultar" : "$" + Number(p).toLocaleString("es-CL");
  }
  function parametro(nombre) {
    // ?id=x en el sitio real; #x como respaldo
    var v = new URLSearchParams(location.search).get(nombre);
    if (!v && nombre === "id" && location.hash) v = location.hash.slice(1);
    return v;
  }
  function mensajePedido(p) {
    var m = "Hola Anime Emporium, quiero consultar por: " + p.nombre;
    if (p.categoria === "Carcasas") m += ". Mi modelo de celular es: ";
    return m;
  }
  function urlProducto(p) {
    return "producto.html?id=" + encodeURIComponent(p.id);
  }

  // Ilustración de reemplazo mientras no haya foto del producto
  function placeholder(categoria) {
    var formas = {
      Tazas: '<rect x="34" y="34" width="60" height="68" rx="8"/><path d="M94 50h8a14 14 0 0 1 0 28h-8" fill="none" stroke-width="7"/>',
      Carcasas: '<rect x="42" y="22" width="52" height="92" rx="12"/><rect x="50" y="30" width="18" height="18" rx="5" class="hueco"/>',
      Mousepads: '<rect x="20" y="40" width="96" height="62" rx="10"/><ellipse cx="88" cy="70" rx="10" ry="15" class="hueco"/>',
      Encendedores: '<rect x="50" y="44" width="36" height="66" rx="6"/><rect x="54" y="26" width="28" height="18" rx="3" class="hueco"/>'
    };
    return '<svg class="ph" viewBox="0 0 136 136" aria-hidden="true">' + (formas[categoria] || formas.Tazas) + "</svg>";
  }
  function media(p, cargaDiferida) {
    return p.imagen
      ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.nombre) + '"' + (cargaDiferida ? ' loading="lazy"' : "") + ' width="800" height="800">'
      : placeholder(p.categoria) + '<span class="sin-foto">Foto pronto</span>';
  }

  function tarjeta(p) {
    var pagar = p.linkPago
      ? '<a class="btn btn-sec" href="' + esc(p.linkPago) + '" target="_blank" rel="noopener">Comprar</a>'
      : "";
    return (
      '<article class="prod">' +
      '<a class="prod-media" href="' + urlProducto(p) + '" tabindex="-1" aria-hidden="true">' + media(p, true) + "</a>" +
      '<div class="prod-body">' +
      '<p class="prod-cat">' + esc(p.categoria) + "</p>" +
      '<h3><a href="' + urlProducto(p) + '">' + esc(p.nombre) + "</a></h3>" +
      '<p class="prod-desc">' + esc(p.descripcion) + "</p>" +
      '<p class="prod-precio">' + formatoPrecio(p.precio) + "</p>" +
      '<div class="prod-acciones">' +
      '<a class="btn btn-wsp" href="' + waLink(mensajePedido(p)) + '" target="_blank" rel="noopener">Pedir por WhatsApp</a>' +
      pagar +
      "</div></div></article>"
    );
  }

  function cargarDatos() {
    return fetch("data/productos.json").then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function errorCarga(el) {
    el.innerHTML =
      '<p class="vacio">No se pudo cargar el catálogo. Si abriste el archivo directo desde la carpeta, usa un servidor local (por ejemplo la extensión Live Server de VS Code).</p>';
  }

  /* ---------- partes comunes ---------- */
  function contacto() {
    document.querySelectorAll("[data-wsp]").forEach(function (a) {
      a.href = waLink(a.getAttribute("data-wsp") || "Hola Anime Emporium, quiero hacer un pedido");
    });
    document.querySelectorAll("[data-ig]").forEach(function (a) {
      a.href = "https://www.instagram.com/" + cfg.instagram + "/";
    });
    document.querySelectorAll("[data-ig-texto]").forEach(function (el) { el.textContent = "@" + cfg.instagram; });
    document.querySelectorAll("[data-correo]").forEach(function (el) {
      el.textContent = cfg.correo;
      var fila = el.closest(".canal");
      if (fila && !cfg.correo) fila.hidden = true;
    });
    document.querySelectorAll("[data-fono]").forEach(function (el) {
      el.textContent = "+" + cfg.whatsapp.replace(/^(\d{2})(\d)(\d{4})(\d{4})$/, "$1 $2 $3 $4");
    });

    var copiar = document.getElementById("copiar-correo");
    if (copiar) {
      copiar.addEventListener("click", function () {
        var ok = function () {
          copiar.textContent = "Copiado";
          setTimeout(function () { copiar.textContent = "Copiar"; }, 1600);
        };
        try { navigator.clipboard.writeText(cfg.correo).then(ok, seleccionar); } catch (e) { seleccionar(); }
      });
    }
    function seleccionar() {
      var el = document.querySelector("[data-correo]");
      var r = document.createRange(); r.selectNodeContents(el);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  }

  function menuMovil() {
    var btn = document.getElementById("btn-menu");
    var nav = document.getElementById("nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      var abierto = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!abierto));
      nav.classList.toggle("abierto", !abierto);
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        btn.setAttribute("aria-expanded", "false");
        nav.classList.remove("abierto");
      }
    });
  }

  /* El catálogo se carga después de que el navegador ya saltó al #ancla,
     así que la página crece y el salto queda corto. Se repite al terminar. */
  function irAlAncla() {
    if (!location.hash) return;
    var el = document.getElementById(location.hash.slice(1));
    if (el) requestAnimationFrame(function () { el.scrollIntoView(); });
  }

  /* ---------- inicio ---------- */
  function paginaInicio() {
    cargarDatos().then(function (d) {
      var dest = d.productos.filter(function (p) { return p.destacado; }).slice(0, 4);
      document.getElementById("grid-destacados").innerHTML = dest.map(tarjeta).join("");

      document.getElementById("grid-colecciones").innerHTML = d.colecciones.map(function (c) {
        var tiene = d.productos.some(function (p) { return p.coleccion === c.id; });
        var href = tiene
          ? 'href="catalogo.html?coleccion=' + encodeURIComponent(c.id) + '"'
          : 'href="' + waLink("Hola Anime Emporium, me interesa la Colección " + c.nombre) + '" target="_blank" rel="noopener"';
        return (
          '<a class="col" ' + href + ">" +
          '<img src="' + esc(c.imagen) + '" alt="Colección ' + esc(c.nombre) + '" loading="lazy" width="800" height="800">' +
          '<span class="col-nombre">' + esc(c.nombre) + (tiene ? "" : " · consultar") + "</span></a>"
        );
      }).join("");
      irAlAncla();
    }).catch(function () { errorCarga(document.getElementById("grid-destacados")); });
  }

  /* ---------- catálogo ---------- */
  function paginaCatalogo() {
    var state = { categoria: "Todos", ocasion: "Todas", coleccion: parametro("coleccion"), datos: null };
    var cat = parametro("categoria");
    if (cat) state.categoria = cat;

    function chips(contenedor, opciones, clave) {
      contenedor.innerHTML = opciones.map(function (o) {
        return '<button type="button" class="chip" aria-pressed="' + (state[clave] === o) + '" data-valor="' + esc(o) + '">' + esc(o) + "</button>";
      }).join("");
      contenedor.onclick = function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        state[clave] = b.getAttribute("data-valor");
        render();
      };
    }

    function render() {
      var d = state.datos;
      chips(document.getElementById("filtro-categoria"), ["Todos"].concat(d.categorias), "categoria");
      chips(document.getElementById("filtro-ocasion"), ["Todas"].concat(d.ocasiones), "ocasion");

      var aviso = document.getElementById("aviso-coleccion");
      var col = d.colecciones.filter(function (c) { return c.id === state.coleccion; })[0];
      if (col) {
        aviso.hidden = false;
        aviso.querySelector("strong").textContent = "Colección " + col.nombre;
      } else {
        aviso.hidden = true;
      }

      var lista = d.productos.filter(function (p) {
        return (state.categoria === "Todos" || p.categoria === state.categoria)
          && (state.ocasion === "Todas" || (p.ocasiones || []).indexOf(state.ocasion) !== -1)
          && (!col || p.coleccion === col.id);
      });
      document.getElementById("grid-productos").innerHTML = lista.length
        ? lista.map(tarjeta).join("")
        : '<p class="vacio">No hay productos con esos filtros. Escríbenos y lo hacemos a pedido.</p>';
      document.getElementById("conteo").textContent = lista.length + (lista.length === 1 ? " producto" : " productos");
    }

    document.getElementById("quitar-coleccion").addEventListener("click", function () {
      state.coleccion = null;
      try { history.replaceState(null, "", "catalogo.html"); } catch (e) {}
      render();
    });

    cargarDatos().then(function (d) { state.datos = d; render(); })
      .catch(function () { errorCarga(document.getElementById("grid-productos")); });
  }

  /* ---------- ficha de producto ---------- */
  function paginaProducto() {
    var cont = document.getElementById("ficha");
    cargarDatos().then(function (d) {
      var id = parametro("id");
      var p = d.productos.filter(function (x) { return x.id === id; })[0];
      if (!p) {
        cont.innerHTML = '<div class="ficha-vacia"><h1>No encontramos ese producto</h1><p>Puede que ya no esté disponible.</p><a class="btn btn-pri" href="catalogo.html">Ver el catálogo</a></div>';
        return;
      }
      document.title = p.nombre + " · Anime Emporium";
      var col = d.colecciones.filter(function (c) { return c.id === p.coleccion; })[0];
      document.getElementById("migas-actual").textContent = p.nombre;

      var ocas = (p.ocasiones || []).map(function (o) { return "<span>" + esc(o) + "</span>"; }).join("");
      var pagar = p.linkPago
        ? '<a class="btn btn-pri" href="' + esc(p.linkPago) + '" target="_blank" rel="noopener">Comprar ahora</a>'
        : "";
      var notaCarcasa = p.categoria === "Carcasas"
        ? '<p class="nota">Las carcasas se hacen según el modelo de tu celular. Indícalo en el mensaje.</p>'
        : "";

      cont.innerHTML =
        '<div class="ficha-media">' + media(p, false) + "</div>" +
        '<div class="ficha-info">' +
        '<p class="prod-cat">' + esc(p.categoria) + (col ? " · Colección " + esc(col.nombre) : "") + "</p>" +
        "<h1>" + esc(p.nombre) + "</h1>" +
        '<p class="ficha-precio">' + formatoPrecio(p.precio) + "</p>" +
        '<p class="ficha-desc">' + esc(p.descripcion) + "</p>" +
        (ocas ? '<div class="ocasiones-lista">' + ocas + "</div>" : "") +
        notaCarcasa +
        '<div class="ficha-acciones">' + pagar +
        '<a class="btn btn-wsp" href="' + waLink(mensajePedido(p)) + '" target="_blank" rel="noopener">Pedir por WhatsApp</a>' +
        "</div>" +
        '<ul class="ficha-datos">' +
        "<li><strong>Envíos</strong> a todo Chile</li>" +
        "<li><strong>Hecho a pedido</strong>: te confirmamos el diseño antes de imprimir</li>" +
        "</ul></div>";

      var rel = d.productos.filter(function (x) {
        return x.id !== p.id && (p.coleccion ? x.coleccion === p.coleccion : x.categoria === p.categoria);
      });
      if (rel.length < 3) {
        rel = rel.concat(d.productos.filter(function (x) {
          return x.id !== p.id && rel.indexOf(x) === -1 && x.categoria === p.categoria;
        }));
      }
      rel = rel.slice(0, 4);
      if (rel.length) {
        document.getElementById("relacionados").hidden = false;
        document.getElementById("grid-relacionados").innerHTML = rel.map(tarjeta).join("");
      }
    }).catch(function () { errorCarga(cont); });
  }

  /* ---------- arranque ---------- */
  var anio = document.getElementById("anio");
  if (anio) anio.textContent = new Date().getFullYear();
  contacto();
  menuMovil();
  if (pagina === "inicio") paginaInicio();
  if (pagina === "catalogo") paginaCatalogo();
  if (pagina === "producto") paginaProducto();
})();
