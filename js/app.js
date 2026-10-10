/**
 * GeoInterfaz · Geovisor de la tesis doctoral
 * "Enfoques y metodologías de planificación territorial local para el desarrollo
 * de franjas de interfaz rural-urbanas limítrofes en ciudades portuarias"
 * Autora: Aida del Carmen Palmett Padilla · Universitat Politècnica de Catalunya (UPC)
 * Desarrollado por: DevGiz (https://devgiz.vercel.app/)
 *
 * Todo el contenido que se muestra procede del manuscrito y de los proyectos QGIS de la
 * tesis (data/catalogo.json, data/vistas.json, data/capas.json). Este archivo solo lo presenta.
 *
 * Motor: MapLibre GL JS 4.7.1 + Turf + Proj4js + qrcode-generator
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------ estado
  let CATALOGO = null;
  let VISTAS = null;
  let CAPAS = null;
  const ITEMS_MAP = new Map();
  const GEOJSON_CACHE = new Map();
  let ORDEN = [];
  let INST = [];

  let map = null;
  let mapReady = false;
  let currentVista = null;
  let currentItem = null;
  let currentBase = 'claro';
  let activeVectorLayerIds = [];
  let activeVectorSourceIds = [];
  let rotulosVisibles = true;
  let baseManual = false;
  let opGlobal = 1;
  const OP_ORIG = {};
  const PROP_OP = { fill: 'fill-opacity', line: 'line-opacity', circle: 'circle-opacity', symbol: 'icon-opacity' };

  const zoomState = { x: 0, y: 0, scale: 1, isDragging: false, startX: 0, startY: 0, imgW: 0, imgH: 0 };

  const BASES = {
    claro: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxzoom: 16
    },
    osm: {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256, attribution: '&copy; OpenStreetMap contributors', maxzoom: 19
    },
    sat: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics', maxzoom: 19
    },
    oscuro: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxzoom: 16
    },
    nada: null
  };

  if (window.proj4) {
    proj4.defs(
      'EPSG:9377',
      '+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
    );
  }

  // ------------------------------------------------------------ utilidades
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICO = {
    mapa: '<svg viewBox="0 0 24 24"><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    imagen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    tabla: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    compartir: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    izq: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
    der: '<svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    filas: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    mas: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
    copiar: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    flecha: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  ICO.dual = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>';
  ICO.pres = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8M10 8l4 2-4 2z"/></svg>';

  const TIPOS = {
    mapa: { uno: 'Mapa', varios: 'Mapas' },
    grafico: { uno: 'Figura', varios: 'Figuras' },
    tabla: { uno: 'Tabla', varios: 'Tablas' },
    esquema: { uno: 'Esquema', varios: 'Esquemas' }
  };

  // Nombres breves de capítulo para la navegación (el título completo va en el atributo title)
  const CAP_CORTO = {
    I: 'Planteamiento del problema',
    II: 'Marco teórico y conceptual',
    III: 'Caso Barranquilla · AMB',
    IV: 'Estudio comparado',
    V: 'Propuesta IOTF-IUR',
    VI: 'Conclusiones'
  };

  // Nombres legibles de las capas. La clave es el nombre técnico de la capa en QGIS.
  const ALIAS = {
    APTITUD_SUELO_RURAL_IGAC: 'Aptitud del suelo rural (IGAC)',
    BARRIOS_LIMITE_ZONA_URBANA: 'Barrios · límite de la zona urbana',
    CENTROIDE_INTERFACE: 'Centroide de la franja de interfaz',
    CIUDADES_PUERTO_LATINOAMERICA: 'Ciudades puerto de Latinoamérica',
    CONECTIVIDADES: 'Conectividades',
    CONFLICTO_USO_FRANJA_INTERFACE: 'Conflictos de uso en la franja de interfaz',
    CORREDORES_ECONOMICOS: 'Corredores económicos',
    CRECIMIENTO_URBANO_AMB: 'Crecimiento urbano del AMB',
    Cienaga: 'Ciénagas',
    DENSIDAD_POBLACION_MANZANA: 'Densidad de población por manzana',
    'DESARROLLOS URBANOS': 'Desarrollos urbanos',
    DESARROLLOS_URBANOS: 'Desarrollos urbanos',
    DESARROLLOS_INMOBILIARIOS: 'Desarrollos inmobiliarios',
    DRENAJES_SENCILLOS_AMB: 'Drenajes del AMB',
    'Departamentos202305 — Depto': 'Departamentos de Colombia',
    'Departamentos202305 — Depto Atlantico': 'Departamento del Atlántico',
    EJES_ESTRUCTURANTES: 'Ejes estructurantes',
    EJE_AMBIENTAL: 'Eje ambiental',
    FRANJA_INTERFACE_URBANO_RURAL_AMB: 'Franja de interfaz urbano-rural del AMB',
    FRANJA_INTERFACE_URBANO_RURAL_AMB_INTEGRADA: 'Franja de interfaz urbano-rural (integrada)',
    FRANJA_INTERFACE_URBANO_RURAL_AMB_MPIOS: 'Franja de interfaz por municipio',
    GALAPA_R_TERRENO: 'Predios rurales de Galapa',
    INFRAESTRUCTURA_OBSTACULO: 'Infraestructura como obstáculo',
    INUNDACION: 'Inundación',
    Integracion_Usos_Propuestos_POT_Municipales: 'Usos propuestos en los POT municipales',
    LOCALIDADES_BARANQUILLA_SEGUN_POT: 'Localidades de Barranquilla según el POT',
    Municipios: 'Municipios',
    Municipios_Atlantico: 'Municipios del Atlántico',
    NODO: 'Nodos',
    NODOS: 'Nodos',
    'PLANES_PARCIALES DENSIDAD DE POBLACION': 'Planes parciales · densidad de población',
    POMCA_MAYORQUIN: 'POMCA Ciénaga de Mallorquín',
    RIOS: 'Ríos',
    SECTORES_INFORMALES: 'Sectores informales',
    SE_Rutas_Transporte_Publico: 'Rutas de transporte público',
    TOPONIMIA_UFP: 'Toponimia',
    UFPs: 'Unidades Funcionales de Planificación (UFP)',
    UFPs_: 'Unidades Funcionales de Planificación (UFP)',
    'UFPs-USOS_SUELO': 'UFP · usos del suelo',
    'UPF-USOS_AMB': 'Usos del suelo por UFP',
    'UPF-USOS_AMB_UFP_1': 'Usos del suelo · UFP 1',
    'UPF-USOS_AMB_UFP_2': 'Usos del suelo · UFP 2',
    'UPF-USOS_AMB_UFP_3': 'Usos del suelo · UFP 3',
    'UPF-USOS_AMB_UFP_4': 'Usos del suelo · UFP 4',
    USOS_DEL_SUELO_ZONA_INTERFACE_AMB: 'Usos del suelo en la zona de interfaz',
    VERTIMIENTOS: 'Vertimientos',
    VIAS_AMB_: 'Vías del AMB',
    'world_map — countries': 'Países',
    'world_map — disputed_borders': 'Límites en disputa',
    'world_map — states_provinces': 'Estados y provincias'
  };
  const SIGLAS = /^(amb|pot|pbot|ufp|ufps|igac|cra|pomca|dane|pemot|zmv|rmbs|gamv|osm|dga|mop|ibge|ine|bcn)$/i;

  function nombreCapa(raw) {
    if (!raw) return 'Capa';
    if (ALIAS[raw]) return ALIAS[raw];
    let s = String(raw).replace(/\s*\((Limpio|Fig\.? ?\d+)\)\s*/gi, ' ').trim();
    if (!/[_]/.test(s) && /[a-záéíóúñ]/.test(s)) return s; // ya es un nombre legible
    s = s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    s = s.split(' ').map((w) => (SIGLAS.test(w) ? w.toUpperCase() : w)).join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // Las clases de la leyenda vienen de los datos; solo se normalizan mayúsculas y guiones bajos.
  function etiquetaLeyenda(t) {
    if (!t) return '';
    if (/_/.test(t)) return nombreCapa(t);
    if (t.length > 5 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4}/.test(t)) {
      const s = t.toLowerCase().split(' ').map((w) => (SIGLAS.test(w) ? w.toUpperCase() : w)).join(' ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return t;
  }

  function etiquetaCorta(it) {
    const e = it.etiqueta || '';
    return e
      .replace(/^Figura\s+/i, 'Fig. ')
      .replace(/^Esquema\s+/i, 'Esq. ')
      .replace(/^Lámina Atlas\s+/i, 'Atlas ')
      .replace(/^(Lámina|Mapa) complementari[ao]/i, 'Compl.');
  }

  function capDe(it) {
    return (CATALOGO.capitulos || []).find((c) => c.id === it.capitulo) || null;
  }
  function capNombre(cap) {
    return CAP_CORTO[cap.num] || cap.nombre;
  }
  function geomDe(capaObj) {
    const c = CAPAS && CAPAS[capaObj.capa];
    return (c && c.geom) || '';
  }

  // --- GENERACIÓN DINÁMICA DE TRAMAS Y MARCADORES PARA MAPLIBRE ---
  function createPatternImage(id) {
    const parts = id.split('|');
    const ang = parseFloat(parts[1]) || 0;
    const sep = parseFloat(parts[2]) || 6;
    const color = parts[3] || '#000000';
    const width = parseFloat(parts[4]) || 1;
    const tipo = parts[5] || 'l';

    const size = Math.max(16, Math.round(sep * 4));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    if (tipo === 'p') {
      ctx.fillStyle = color;
      const s = Math.max(sep, 4);
      const r = Math.max(width * 1.2, 0.8);
      for (let x = 0; x <= size; x += s) {
        for (let y = 0; y <= size; y += s) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(width, 0.9);
      ctx.save();
      const rad = (ang * Math.PI) / 180;
      const diag = size * 1.5;
      ctx.translate(size / 2, size / 2);
      ctx.rotate(rad);
      const drawLines = () => {
        for (let offset = -diag; offset <= diag; offset += sep) {
          ctx.beginPath();
          ctx.moveTo(offset, -diag);
          ctx.lineTo(offset, diag);
          ctx.stroke();
        }
      };
      drawLines();
      if (tipo === 'x') {
        ctx.rotate(Math.PI / 2);
        drawLines();
      }
      ctx.restore();
    }
    return ctx.getImageData(0, 0, size, size);
  }

  function createMarkerImage(id) {
    const parts = id.split('|');
    const forma = parts[1] || 'circle';
    const color = parts[2] === 'none' ? 'transparent' : (parts[2] || '#ff0000');
    const borde = parts[3] === 'none' ? 'transparent' : (parts[3] || '#000000');
    const tam = parseInt(parts[4], 10) || 16;

    const pad = 4;
    const size = tam + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = tam / 2;

    ctx.fillStyle = color;
    ctx.strokeStyle = borde;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (forma === 'star') {
      const spikes = 5;
      const outer = r;
      const inner = r * 0.45;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      ctx.moveTo(cx, cy - outer);
      for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
        rot += step;
      }
      ctx.closePath();
    } else if (forma === 'diamond') {
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
    } else if (forma === 'square') {
      ctx.rect(cx - r, cy - r, tam, tam);
    } else if (forma === 'triangle') {
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.lineTo(cx - r, cy + r);
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }

    if (color !== 'transparent') ctx.fill();
    if (borde !== 'transparent') ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
  }

  // Generador de iconos SVG para la leyenda del panel
  function createLegendSvg(m) {
    if (!m) return '';
    const g = m.g || 'Polygon';
    if (g === 'Line') {
      const color = m.linea || '#000000';
      const dash = m.dash ? 'stroke-dasharray="3,2"' : '';
      const w = Math.min(Math.max(m.lw || 1.5, 1), 3.5);
      return `<svg width="18" height="14" viewBox="0 0 18 14"><line x1="1" y1="7" x2="17" y2="7" stroke="${color}" stroke-width="${w}" ${dash} stroke-linecap="round"/></svg>`;
    } else if (g === 'Point') {
      const color = m.fill || '#ff0000';
      const border = m.linea || '#000000';
      if (m.forma === 'star') {
        return `<svg width="16" height="16" viewBox="0 0 24 24"><polygon points="12,2 15,9 23,9 17,14 19,21 12,17 5,21 7,14 1,9 9,9" fill="${color}" stroke="${border}" stroke-width="1.5"/></svg>`;
      } else if (m.forma === 'diamond') {
        return `<svg width="16" height="16" viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" fill="${color}" stroke="${border}" stroke-width="1.5"/></svg>`;
      } else {
        return `<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="${color}" stroke="${border}" stroke-width="1.2"/></svg>`;
      }
    } else {
      const fill = m.fill || 'transparent';
      const fop = m.fop !== undefined ? m.fop : 0.6;
      const border = m.linea || '#232323';
      const bw = Math.min(Math.max(m.lw || 1, 0.8), 2.5);
      const dash = m.dash ? 'stroke-dasharray="3,2"' : '';
      let patternDef = '';
      let fillAttr = fill;
      let fillOpacity = fop;
      if (m.trama) {
        const pid = 'pat_' + Math.random().toString(36).substr(2, 6);
        const tc = m.trama.c || '#000000';
        if (m.trama.p) {
          patternDef = `<defs><pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="${tc}"/></pattern></defs>`;
        } else {
          patternDef = `<defs><pattern id="${pid}" width="6" height="6" patternTransform="rotate(${m.trama.a || 45})" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="${tc}" stroke-width="1.2"/></pattern></defs>`;
        }
        fillAttr = `url(#${pid})`;
        fillOpacity = 1;
      }
      return `<svg width="18" height="14" viewBox="0 0 18 14">${patternDef}<rect x="1" y="1" width="16" height="12" rx="2" fill="${fillAttr}" fill-opacity="${fillOpacity}" stroke="${border}" stroke-width="${bw}" ${dash}/></svg>`;
    }
  }

  // ------------------------------------------------------ avisos y diálogos
  let avisoT = null;
  function showToast(txt) {
    const aviso = $('aviso');
    if (!aviso) return;
    aviso.textContent = txt;
    aviso.classList.add('ver');
    clearTimeout(avisoT);
    avisoT = setTimeout(() => aviso.classList.remove('ver'), 2600);
  }

  function copiar(txt, okMsg) {
    const fin = () => showToast(okMsg);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(fin, () => showToast('No se pudo copiar. Seleccione el texto y cópielo manualmente.'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); fin(); } catch (_) { /* sin portapapeles */ }
      ta.remove();
    }
  }

  // Dirección pública del geovisor. En local se usa también, para que los enlaces copiados sirvan en la tesis.
  const URL_PUBLICA = 'https://geointerfaz.vercel.app/';
  function enlaceDe(item) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) || window.location.protocol === 'file:';
    const base = local ? URL_PUBLICA : `${window.location.origin}${window.location.pathname}`;
    return `${base}#/${item.id}`;
  }

  function openShareDialog(item) {
    const dlg = $('dlg');
    const cuerpo = $('dlgCuerpo');
    if (!dlg || !cuerpo) return;

    const deepLink = enlaceDe(item);
    let qrHtml = '';
    if (typeof qrcode !== 'undefined') {
      try {
        const qr = qrcode(0, 'M');
        qr.addData(deepLink);
        qr.make();
        qrHtml = qr.createImgTag(4, 8);
      } catch (err) {
        console.warn('No se pudo generar el código QR:', err);
      }
    }

    const notaSugerida = item.vista
      ? `Versión interactiva de este mapa, con sus capas, leyenda y atributos, disponible en: ${deepLink}`
      : `Versión digital en alta resolución disponible en: ${deepLink}`;

    cuerpo.innerHTML = `
      <div class="dlg-cab">
        <div>
          <div class="dlg-sup">${esc(item.etiqueta)}</div>
          <h3>Enlace para citar en la tesis</h3>
        </div>
        <button class="ico-btn" id="dlgCerrar" aria-label="Cerrar">${ICO.cerrar}</button>
      </div>
      <div class="dlg-qr">
        <div class="qr">${qrHtml}</div>
        <div class="dlg-col">
          <label>Enlace permanente</label>
          <div class="url" id="dlgUrl">${esc(deepLink)}</div>
          <button class="btn pri" id="btnCopiarUrl">${ICO.copiar} Copiar enlace</button>
          <p class="ayuda">Este enlace abre directamente esta vista. El código QR lleva al mismo lugar desde la versión impresa.</p>
        </div>
      </div>
      <label>Texto sugerido para añadir a la nota</label>
      <textarea id="txtNota" readonly rows="3">${esc(notaSugerida)}</textarea>
      <button class="btn" id="btnCopiarNota">${ICO.copiar} Copiar texto</button>
    `;

    $('dlgCerrar').addEventListener('click', () => dlg.close());
    $('btnCopiarUrl').addEventListener('click', () => copiar(deepLink, 'Enlace copiado'));
    $('btnCopiarNota').addEventListener('click', () => copiar(notaSugerida, 'Texto copiado'));
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------- motor cartográfico
  function capasConsultables() {
    return activeVectorLayerIds.filter((id) => {
      const l = map.getLayer(id);
      return l && map.getLayoutProperty(id, 'visibility') !== 'none' && !id.endsWith('__label');
    });
  }
  function tituloElemento(p) {
    return p.NOMBRE || p.Nombre || p.nombre || p.Name || p.name || p.NAME || p.MpNombre || p.DeNombre || p.NOMBRE_GEO || p.NOMAH || p.UFP || '';
  }

  function initMap() {
    if (map) return true;

    try {
      map = new maplibregl.Map({
        container: 'mapa',
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            'base-source': {
              type: 'raster',
              tiles: BASES.claro.tiles,
              tileSize: 256,
              attribution: BASES.claro.attribution,
              maxzoom: BASES.claro.maxzoom
            }
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#eef1f4' } },
            { id: 'base-layer', type: 'raster', source: 'base-source', paint: { 'raster-opacity': 1.0 } }
          ]
        },
        center: [-74.8, 10.98],
        zoom: 11,
        attributionControl: false,
        preserveDrawingBuffer: true
      });

      window._testMap = map;
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'Desarrollado por <a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer"><strong>DevGiz</strong></a>'
      }), 'bottom-right');
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
      map.addControl(new maplibregl.FullscreenControl(), 'top-left');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

      const carga = $('mapCarga');
      map.on('dataloading', () => { if (carga) carga.hidden = false; });
      map.on('idle', () => { if (carga) carga.hidden = true; });

      const coordEl = $('coord');
      const tooltipEl = $('mapTooltip');

      map.on('mousemove', (e) => {
        if (coordEl) {
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          let extra = '';
          if (window.proj4 && lng > -80 && lng < -66 && lat > -5 && lat < 14) {
            try {
              const p = proj4('EPSG:4326', 'EPSG:9377', [lng, lat]);
              extra = ` · N ${Math.round(p[1]).toLocaleString('es-CO')}  E ${Math.round(p[0]).toLocaleString('es-CO')} (EPSG:9377)`;
            } catch (_) { /* fuera del ámbito de la proyección */ }
          }
          coordEl.textContent = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°${extra}`;
        }

        if (modoMedicion) {
          map.getCanvas().style.cursor = 'crosshair';
          if (tooltipEl) tooltipEl.hidden = true;
          return;
        }
        const visibles = capasConsultables();
        const fs = visibles.length ? map.queryRenderedFeatures(e.point, { layers: visibles }) : [];
        if (fs.length) {
          map.getCanvas().style.cursor = 'pointer';
          resaltar(fs[0]);
          const tit = tituloElemento(fs[0].properties || {});
          if (tooltipEl && tit) {
            tooltipEl.textContent = tit;
            tooltipEl.style.left = `${e.point.x}px`;
            tooltipEl.style.top = `${e.point.y}px`;
            tooltipEl.hidden = false;
          } else if (tooltipEl) {
            tooltipEl.hidden = true;
          }
        } else {
          map.getCanvas().style.cursor = '';
          if (tooltipEl) tooltipEl.hidden = true;
          resaltar(null);
        }
      });

      map.on('mouseout', () => {
        if (coordEl) coordEl.textContent = '';
        if (tooltipEl) tooltipEl.hidden = true;
      });

      map.on('click', (e) => {
        if (modoMedicion) {
          puntosMedicion.push([e.lngLat.lng, e.lngLat.lat]);
          actualizarMedicionGeoJSON();
          return;
        }
        const visibles = capasConsultables();
        if (!visibles.length) return;
        const fs = map.queryRenderedFeatures(e.point, { layers: visibles });
        if (!fs.length) return;

        const f = fs[0];
        const props = f.properties || {};
        let capaObj = null;
        const m = f.layer.id.match(/^lyr_(\d+)_/);
        if (m && currentVista) capaObj = currentVista.capas[parseInt(m[1], 10)];
        const nomCapa = capaObj ? nombreCapa(capaObj.nombre) : 'Capa';
        const tit = tituloElemento(props);

        let filas = '';
        let n = 0;
        for (const [k, v] of Object.entries(props)) {
          if (v === null || v === undefined || v === '' || v === 'null') continue;
          if (/^(id|fid|objectid|pk_cue|globalid)$/i.test(k) || /^shape_/i.test(k)) continue;
          if (n++ >= 8) break;
          const val = typeof v === 'number' ? v.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : v;
          filas += `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`;
        }

        new maplibregl.Popup({ closeButton: true, offset: 10, maxWidth: '300px' })
          .setLngLat(e.lngLat)
          .setHTML(`<div class="pop"><div class="pop-capa">${esc(nomCapa)}</div>${tit ? `<h4>${esc(tit)}</h4>` : ''}<table>${filas}</table></div>`)
          .addTo(map);
      });

      mapReady = true;
      return true;
    } catch (err) {
      console.warn('MapLibre no pudo iniciar WebGL:', err);
      const mapaEl = $('mapa');
      if (mapaEl) {
        mapaEl.innerHTML = `
          <div class="sin-webgl">
            <strong>El mapa interactivo necesita aceleración gráfica (WebGL)</strong>
            <span>Mientras tanto puede consultar la lámina en alta resolución desde la pestaña «Lámina».</span>
          </div>`;
      }
      mapReady = false;
      return false;
    }
  }

  function setBaseMap(type) {
    currentBase = type;
    document.querySelectorAll('#bases .base-card').forEach((card) => {
      card.classList.toggle('on', card.getAttribute('data-base') === type);
    });
    const rad = document.querySelector(`input[name="base"][value="${type}"]`);
    if (rad) rad.checked = true;
    if (!map || !mapReady) return;

    if (type === 'nada') {
      if (map.getLayer('base-layer')) map.setLayoutProperty('base-layer', 'visibility', 'none');
      return;
    }
    const conf = BASES[type];
    if (!conf) return;

    if (map.getLayer('base-layer')) map.removeLayer('base-layer');
    if (map.getSource('base-source')) map.removeSource('base-source');
    map.addSource('base-source', {
      type: 'raster', tiles: conf.tiles, tileSize: conf.tileSize, attribution: conf.attribution, maxzoom: conf.maxzoom
    });
    const layers = map.getStyle().layers || [];
    let beforeId;
    for (const l of layers) {
      if (l.id !== 'background' && l.id !== 'base-layer') { beforeId = l.id; break; }
    }
    map.addLayer({ id: 'base-layer', type: 'raster', source: 'base-source', paint: { 'raster-opacity': 1.0 } }, beforeId);
  }

  function loadVista(vistaId) {
    if (!VISTAS || !VISTAS[vistaId]) {
      console.warn('Vista no encontrada:', vistaId);
      return;
    }
    const vista = VISTAS[vistaId];
    currentVista = vista;
    renderPanel(vista);

    if (!initMap() || !map) return;
    if (map.isStyleLoaded()) applyVistaLayers(vista);
    else map.once('load', () => { if (currentVista === vista) applyVistaLayers(vista); });
  }

  function ajustarEncuadre(bbox, instant) {
    if (!map || !mapReady || !bbox || bbox.length !== 4) return;
    map.resize();
    const panel = $('panel');
    const panelAbierto = panel && !panel.hidden;
    const movil = window.innerWidth <= 900;
    const w = map.getContainer().clientWidth || window.innerWidth;
    const der = movil || !panelAbierto ? 36 : Math.min(330, Math.floor(w * 0.32));
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding: { top: 36, bottom: 40, left: 64, right: der },
      maxZoom: 16,
      duration: instant ? 0 : 600
    });
  }
  function ajustarEncuadreVista(vista, instant) {
    if (vista) ajustarEncuadre(vista.bbox || vista.caja, instant);
  }

  // Rótulos cartográficos: un mismo criterio tipográfico para todas las vistas.
  function capaDeRotulos(capaObj, lblId, srcId) {
    const etq = capaObj.estilo.etiqueta;
    const geom = geomDe(capaObj);
    const nom = capaObj.nombre || '';
    const base = Math.min(Math.max(etq.tam || 11, 10), 14);
    const tam = (k) => ['interpolate', ['linear'], ['zoom'], 7, base * 0.74 * k, 11, base * 0.92 * k, 14, base * 1.08 * k, 17, base * 1.3 * k];

    const layout = {
      'text-field': etq.texto,
      'text-font': ['Noto Sans Regular'],
      'text-size': tam(1),
      'text-max-width': 8,
      'text-line-height': 1.15,
      'text-padding': 5,
      'text-allow-overlap': false,
      'text-optional': true,
      visibility: capaObj.apagada || !rotulosVisibles ? 'none' : 'visible'
    };
    const paint = {
      'text-color': '#1f2937',
      'text-halo-color': 'rgba(255,255,255,0.94)',
      'text-halo-width': 1.7,
      'text-halo-blur': 0.4
    };

    const esHidro = /rio|rios|cienaga|drenaje|hidro|quebrada|canal|arroyo|agua/i.test(nom);
    const esLimite = /municip|departament|countries|states|provinc|comunal|limite|límite|localidad|barrio/i.test(nom);

    if (geom === 'Line') {
      layout['symbol-placement'] = 'line';
      layout['symbol-spacing'] = 380;
      layout['text-max-angle'] = 32;
      layout['text-size'] = tam(0.86);
      layout['text-letter-spacing'] = 0.03;
      if (esHidro) {
        layout['text-font'] = ['Noto Sans Italic'];
        paint['text-color'] = '#1c6e9c';
      } else {
        paint['text-color'] = '#4b5563';
      }
    } else if (geom === 'Point') {
      layout['text-font'] = [etq.negrita ? 'Noto Sans Bold' : 'Noto Sans Regular'];
      layout['text-variable-anchor'] = ['top', 'bottom', 'left', 'right', 'top-left', 'top-right'];
      layout['text-radial-offset'] = 0.75;
      layout['text-justify'] = 'auto';
      layout['text-optional'] = false;
      paint['text-color'] = '#111827';
      paint['text-halo-width'] = 2;
    } else if (esLimite) {
      layout['text-font'] = ['Noto Sans Bold'];
      layout['text-transform'] = 'uppercase';
      layout['text-letter-spacing'] = 0.11;
      layout['text-size'] = tam(0.8);
      layout['text-max-width'] = 7;
      paint['text-color'] = '#475569';
      paint['text-halo-width'] = 2;
    } else {
      if (esHidro) {
        layout['text-font'] = ['Noto Sans Italic'];
        paint['text-color'] = '#1c6e9c';
      } else if (etq.negrita) {
        layout['text-font'] = ['Noto Sans Bold'];
      }
      layout['text-size'] = tam(0.9);
    }
    return { id: lblId, type: 'symbol', source: srcId, layout, paint };
  }

  function applyVistaLayers(vista) {
    if (!map || !mapReady) return;

    const style = map.getStyle();
    if (style && style.layers) {
      style.layers.forEach((l) => {
        if (l.id.startsWith('lyr_') && map.getLayer(l.id)) map.removeLayer(l.id);
      });
    }
    if (style && style.sources) {
      Object.keys(style.sources).forEach((srcId) => {
        if (srcId.startsWith('src_') && map.getSource(srcId)) map.removeSource(srcId);
      });
    }
    activeVectorLayerIds = [];
    activeVectorSourceIds = [];

    if (modo3D) {
      modo3D = false;
      $('btn3D')?.classList.remove('on');
      map.jumpTo({ pitch: 0, bearing: 0 });
    }
    ajustarEncuadreVista(vista, true);

    // Fondo: se respeta el satélite cuando la composición de QGIS lo usa; en los demás casos
    // se parte de un fondo claro para que la cartografía de la tesis sea la protagonista.
    const fondo = vista.fondo === 'sat' || vista.fondo === 'nada' ? vista.fondo : temaOscuro() ? 'oscuro' : 'claro';
    if (!baseManual && currentBase !== fondo) setBaseMap(fondo);

    vista.capas.forEach((c) => {
      ((c.estilo && c.estilo.ml) || []).forEach((ml) => {
        const pat = ml.paint && ml.paint['fill-pattern'];
        if (pat && !map.hasImage(pat)) map.addImage(pat, createPatternImage(pat));
        const ico = ml.layout && ml.layout['icon-image'];
        if (ico && !map.hasImage(ico)) map.addImage(ico, createMarkerImage(ico));
      });
    });

    // 1) geometrías, de abajo hacia arriba como en la composición de QGIS
    for (let i = vista.capas.length - 1; i >= 0; i--) {
      const capaObj = vista.capas[i];
      capaObj._layerIds = [];
      capaObj._f = 1;
      const srcId = `src_${i}_${capaObj.capa}`;
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: `data/capas/${capaObj.capa}.geojson` });
        activeVectorSourceIds.push(srcId);
      }
      ((capaObj.estilo && capaObj.estilo.ml) || []).forEach((ml, subIdx) => {
        const lyrId = `lyr_${i}_${capaObj.capa}_${subIdx}`;
        const def = { id: lyrId, type: ml.type, source: srcId, layout: Object.assign({}, ml.layout || {}), paint: Object.assign({}, ml.paint || {}) };
        if (ml.filter) def.filter = ml.filter;
        if (capaObj.apagada) def.layout.visibility = 'none';
        if (PROP_OP[ml.type]) OP_ORIG[lyrId] = def.paint[PROP_OP[ml.type]] === undefined ? 1 : def.paint[PROP_OP[ml.type]];
        map.addLayer(def);
        activeVectorLayerIds.push(lyrId);
        capaObj._layerIds.push(lyrId);
      });
    }
    // 2) rótulos, siempre por encima de todas las geometrías
    for (let i = vista.capas.length - 1; i >= 0; i--) {
      const capaObj = vista.capas[i];
      if (!(capaObj.estilo && capaObj.estilo.etiqueta)) continue;
      const lblId = `lyr_${i}_${capaObj.capa}__label`;
      map.addLayer(capaDeRotulos(capaObj, lblId, `src_${i}_${capaObj.capa}`));
      activeVectorLayerIds.push(lblId);
      capaObj._layerIds.push(lblId);
    }

    agregarResaltado();
    if (opGlobal < 1) vista.capas.forEach(aplicarOpacidad);

    setTimeout(() => { if (currentVista === vista) ajustarEncuadreVista(vista, true); }, 160);
  }

  // Opacidad: la de cada capa (panel) por la general (pestaña Fondo), sobre la opacidad original de QGIS.
  function aplicarOpacidad(capaObj) {
    if (!map || !mapReady) return;
    const f = (capaObj._f === undefined ? 1 : capaObj._f) * opGlobal;
    (capaObj._layerIds || []).forEach((id) => {
      const l = map.getLayer(id);
      if (!l) return;
      try {
        if (id.endsWith('__label')) { map.setPaintProperty(id, 'text-opacity', f); return; }
        const pr = PROP_OP[l.type];
        if (!pr) return;
        const o = OP_ORIG[id];
        map.setPaintProperty(id, pr, typeof o === 'number' ? o * f : f >= 0.999 ? o : ['*', f, o]);
        if (l.type === 'symbol') map.setPaintProperty(id, 'text-opacity', f);
      } catch (_) { /* expresiones que no admiten el producto: se deja la opacidad original */ }
    });
  }

  // Resaltado del elemento bajo el cursor
  let claveResaltado = null;
  function agregarResaltado() {
    claveResaltado = null;
    map.addSource('src_zz_hover', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const noPunto = ['!=', ['geometry-type'], 'Point'];
    map.addLayer({ id: 'lyr_zz_hover_a', type: 'line', source: 'src_zz_hover', filter: noPunto, paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': 0.75 } });
    map.addLayer({ id: 'lyr_zz_hover_b', type: 'line', source: 'src_zz_hover', filter: noPunto, paint: { 'line-color': '#0f2a43', 'line-width': 2.4 } });
    map.addLayer({ id: 'lyr_zz_hover_c', type: 'circle', source: 'src_zz_hover', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 11, 'circle-opacity': 0, 'circle-stroke-color': '#0f2a43', 'circle-stroke-width': 2.4 } });
  }
  function resaltar(f) {
    if (!map || !map.getSource('src_zz_hover')) return;
    const k = f ? `${f.layer.id}|${f.id !== undefined ? f.id : JSON.stringify(f.properties).slice(0, 160)}` : null;
    if (k === claveResaltado) return;
    claveResaltado = k;
    map.getSource('src_zz_hover').setData({ type: 'FeatureCollection', features: f ? [{ type: 'Feature', geometry: f.geometry, properties: {} }] : [] });
  }

  function setCapaVisible(capaObj, visible) {
    capaObj.apagada = !visible;
    if (!map || !mapReady || !capaObj._layerIds) return;
    capaObj._layerIds.forEach((id) => {
      if (!map.getLayer(id)) return;
      const v = visible && (rotulosVisibles || !id.endsWith('__label'));
      map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    });
  }

  function setRotulos(ver) {
    rotulosVisibles = ver;
    $('btnRotulos')?.classList.toggle('off', !ver);
    if (!map || !mapReady || !currentVista) return;
    currentVista.capas.forEach((c) => {
      (c._layerIds || []).forEach((id) => {
        if (id.endsWith('__label') && map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', ver && !c.apagada ? 'visible' : 'none');
        }
      });
    });
  }

  // ------------------------------------------------ panel: leyenda y capas
  function renderLeyenda(vista) {
    const cont = $('ptLeyenda');
    if (!cont) return;
    const bloques = vista.capas
      .filter((c) => !c.apagada && c.estilo && c.estilo.leyenda && c.estilo.leyenda.length)
      .map((c) => {
        const nom = nombreCapa(c.nombre);
        const ley = c.estilo.leyenda;
        if (ley.length === 1) {
          return `<div class="ley-fila">${createLegendSvg(ley[0].m)}<span>${esc(nom)}</span></div>`;
        }
        const filas = ley
          .map((it) => `<div class="ley-fila">${createLegendSvg(it.m)}<span>${esc(etiquetaLeyenda(it.etq))}</span></div>`)
          .join('');
        return `<div class="ley-grupo"><div class="ley-tit">${esc(nom)}</div>${filas}</div>`;
      })
      .join('');
    const fuentes = currentItem && currentItem._inst && currentItem._inst.length
      ? `<div class="ley-fuentes"><div class="ley-tit">Fuentes de los datos</div>${logosDe(currentItem, 'logos-fila chicos')}</div>`
      : '';
    cont.innerHTML = (bloques || '<p class="ayuda">No hay capas visibles. Actívelas en la pestaña «Capas».</p>') + fuentes;
  }

  function renderPanel(vista) {
    renderLeyenda(vista);

    const cont = $('listaCapas');
    cont.innerHTML = '';
    const n = $('nCapasPanel');
    if (n) n.textContent = vista.capas.length;

    vista.capas.forEach((capaObj, idx) => {
      const el = document.createElement('div');
      el.className = `capa${capaObj.apagada ? ' off' : ''}`;
      const nom = nombreCapa(capaObj.nombre);
      const info = CAPAS && CAPAS[capaObj.capa];
      const sub = info ? `${info.n ? info.n.toLocaleString('es-CO') + ' elementos' : ''}` : '';
      el.innerHTML = `
        <div class="capa-fila">
          <label class="sw" title="Mostrar u ocultar la capa">
            <input type="checkbox" ${capaObj.apagada ? '' : 'checked'}>
            <i></i>
          </label>
          <div class="capa-nom" title="Nombre en QGIS: ${esc(capaObj.nombre)}">
            <span>${esc(nom)}</span>
            ${sub ? `<small>${esc(sub)}</small>` : ''}
          </div>
          <button class="ico-btn chico" data-a="tabla" title="Ver tabla de atributos">${ICO.filas}</button>
          <button class="ico-btn chico" data-a="mas" title="Opacidad">${ICO.mas}</button>
        </div>
        <div class="capa-ops" hidden>
          <span>Opacidad</span>
          <input type="range" min="0" max="100" value="100" aria-label="Opacidad de ${esc(nom)}">
        </div>
      `;

      const chk = el.querySelector('input[type="checkbox"]');
      chk.addEventListener('change', () => {
        el.classList.toggle('off', !chk.checked);
        setCapaVisible(capaObj, chk.checked);
        renderLeyenda(vista);
      });

      const ops = el.querySelector('.capa-ops');
      el.querySelector('[data-a="mas"]').addEventListener('click', () => { ops.hidden = !ops.hidden; });
      el.querySelector('[data-a="tabla"]').addEventListener('click', () => abrirCajonAtributos(capaObj));

      ops.querySelector('input').addEventListener('input', (ev) => {
        capaObj._f = parseFloat(ev.target.value) / 100;
        aplicarOpacidad(capaObj);
      });

      cont.appendChild(el);
    });

    const omitEl = $('omitidas');
    if (omitEl) {
      omitEl.innerHTML = vista.omitidas && vista.omitidas.length
        ? `<details class="omit">
             <summary>${vista.omitidas.length} capa(s) de la composición no se publican</summary>
             <ul>${vista.omitidas.map((o) => `<li><strong>${esc(nombreCapa(o.nombre))}:</strong> ${esc(o.motivo)}</li>`).join('')}</ul>
           </details>`
        : '';
    }
  }

  function initPanel() {
    const panel = $('panel');
    const abrir = $('btnPanelAbrir');
    const setAbierto = (v) => {
      panel.hidden = !v;
      abrir.hidden = v;
    };
    $('btnPlegar').addEventListener('click', () => setAbierto(false));
    abrir.addEventListener('click', () => setAbierto(true));
    if (window.innerWidth <= 900) setAbierto(false);

    panel.querySelectorAll('.pest-mini button').forEach((b) => {
      b.addEventListener('click', () => {
        panel.querySelectorAll('.pest-mini button').forEach((x) => x.classList.toggle('on', x === b));
        const t = b.getAttribute('data-pt');
        $('ptLeyenda').hidden = t !== 'leyenda';
        $('ptCapas').hidden = t !== 'capas';
        $('ptFondo').hidden = t !== 'fondo';
      });
    });

    document.querySelectorAll('#bases .base-card').forEach((card) => {
      card.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'INPUT') return; // el clic en la etiqueta ya se atendió
        baseManual = true; // desde aquí se respeta el fondo que eligió la persona
        setBaseMap(card.getAttribute('data-base'));
      });
    });
  }

  // --- TABLA DE ATRIBUTOS (CAJÓN) ---
  async function abrirCajonAtributos(capaObj) {
    const cajon = document.getElementById('cajon');
    const tit = document.getElementById('cajonTit');
    const filtro = document.getElementById('cajonFiltro');
    const cajonN = document.getElementById('cajonN');
    const tablaCont = document.getElementById('cajonTabla');

    if (!cajon || !tablaCont) return;

    tit.textContent = nombreCapa(capaObj.nombre);
    cajon.hidden = false;
    tablaCont.innerHTML = '<div style="padding:16px;color:var(--gris)">Cargando datos espaciales…</div>';
    filtro.value = '';

    let geojson = GEOJSON_CACHE.get(capaObj.capa);
    if (!geojson) {
      try {
        const resp = await fetch(`data/capas/${capaObj.capa}.geojson`, FRESCO);
        geojson = await resp.json();
        GEOJSON_CACHE.set(capaObj.capa, geojson);
      } catch (err) {
        tablaCont.innerHTML = '<div style="padding:16px;color:#c00">Error al cargar el archivo de datos GeoJSON.</div>';
        return;
      }
    }

    const features = geojson.features || [];
    cajonN.textContent = `${features.length} elementos`;

    if (!features.length) {
      tablaCont.innerHTML = '<div style="padding:16px;color:var(--gris)">No hay registros en esta capa.</div>';
      return;
    }

    const cols = Object.keys(features[0].properties || {}).filter(
      (c) => !c.startsWith('SHAPE_') && !c.startsWith('GLOBALID') && c !== 'PK_CUE'
    );

    function renderFilas(filtradas) {
      const rowsHtml = filtradas
        .slice(0, 500)
        .map((f, idx) => {
          const cells = cols
            .map((c) => {
              const val = f.properties[c];
              const isNum = typeof val === 'number';
              const txt = val !== null && val !== undefined ? String(val) : '';
              return `<td class="${isNum ? 'num' : ''}" title="${txt.replace(/"/g, '&quot;')}">${txt}</td>`;
            })
            .join('');
          return `<tr data-idx="${idx}">${cells}</tr>`;
        })
        .join('');

      tablaCont.innerHTML = `
        <table class="datos">
          <thead>
            <tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;

      tablaCont.querySelectorAll('tbody tr').forEach((tr) => {
        tr.addEventListener('click', () => {
          const f = filtradas[parseInt(tr.getAttribute('data-idx'), 10)];
          if (f && f.geometry && map && mapReady) {
            zoomToFeature(f);
          }
        });
      });
    }

    renderFilas(features);

    filtro.oninput = () => {
      const q = filtro.value.trim().toLowerCase();
      if (!q) {
        cajonN.textContent = `${features.length} elementos`;
        renderFilas(features);
        return;
      }
      const filtradas = features.filter((f) =>
        cols.some((c) => String(f.properties[c] || '').toLowerCase().includes(q))
      );
      cajonN.textContent = `${filtradas.length} de ${features.length} elementos`;
      renderFilas(filtradas);
    };
  }

  function zoomToFeature(feature) {
    if (!feature.geometry) return;
    const geom = feature.geometry;
    let coords = [];
    if (geom.type === 'Point') {
      coords = [geom.coordinates];
    } else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
      coords = geom.coordinates;
    } else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') {
      geom.coordinates.forEach((ring) => coords.push(...ring));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) => poly.forEach((ring) => coords.push(...ring)));
    }

    if (!coords.length) return;

    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 15, duration: 800 });
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      coords.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY]
        ],
        { padding: 80, maxZoom: 16, duration: 800 }
      );
    }
  }

  // --- VISOR DE LÁMINAS EN ALTA RESOLUCIÓN (ZOOMER) ---
  function initZoomer() {
    const zoomer = document.getElementById('zoomer');
    const img = document.getElementById('zoomImg');
    const btnMas = document.getElementById('zMas');
    const btnMenos = document.getElementById('zMenos');
    const btnAjustar = document.getElementById('zAjustar');

    if (!zoomer || !img) return;

    function applyTransform() {
      img.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
    }

    function fitToScreen() {
      const cw = zoomer.clientWidth || 800;
      const ch = zoomer.clientHeight || 600;
      const iw = zoomState.imgW || img.naturalWidth || 1000;
      const ih = zoomState.imgH || img.naturalHeight || 700;

      const s = Math.min((cw - 40) / iw, (ch - 40) / ih, 1.2);
      zoomState.scale = Math.max(0.08, s);
      zoomState.x = (cw - iw * zoomState.scale) / 2;
      zoomState.y = (ch - ih * zoomState.scale) / 2;
      applyTransform();
    }

    function zoomAt(cx, cy, factor) {
      const prevScale = zoomState.scale;
      const nextScale = Math.max(0.05, Math.min(zoomState.scale * factor, 6.0));
      zoomState.scale = nextScale;
      zoomState.x = cx - ((cx - zoomState.x) * nextScale) / prevScale;
      zoomState.y = cy - ((cy - zoomState.y) * nextScale) / prevScale;
      applyTransform();
    }

    img.onload = () => {
      zoomState.imgW = img.naturalWidth;
      zoomState.imgH = img.naturalHeight;
      fitToScreen();
    };

    btnMas?.addEventListener('click', () => {
      zoomAt(zoomer.clientWidth / 2, zoomer.clientHeight / 2, 1.28);
    });
    btnMenos?.addEventListener('click', () => {
      zoomAt(zoomer.clientWidth / 2, zoomer.clientHeight / 2, 0.78);
    });
    btnAjustar?.addEventListener('click', fitToScreen);

    zoomer.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = zoomer.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        zoomAt(cx, cy, factor);
      },
      { passive: false }
    );

    zoomer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      zoomState.isDragging = true;
      zoomState.startX = e.clientX - zoomState.x;
      zoomState.startY = e.clientY - zoomState.y;
      zoomer.classList.add('arr');
      zoomer.setPointerCapture(e.pointerId);
    });

    zoomer.addEventListener('pointermove', (e) => {
      if (!zoomState.isDragging) return;
      zoomState.x = e.clientX - zoomState.startX;
      zoomState.y = e.clientY - zoomState.startY;
      applyTransform();
    });

    const stopDrag = (e) => {
      if (zoomState.isDragging) {
        zoomState.isDragging = false;
        zoomer.classList.remove('arr');
        try {
          zoomer.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };
    zoomer.addEventListener('pointerup', stopDrag);
    zoomer.addEventListener('pointercancel', stopDrag);

    window.fitImageZoomer = fitToScreen;
  }

  // ------------------------------------------ cambio de vista del lienzo
  function switchLienzoView(mode) {
    const dual = mode === 'dual';
    document.querySelector('#pgElemento .lienzo').classList.toggle('dual', dual);
    $('visMapa').hidden = !(mode === 'mapa' || dual);
    $('visImagen').hidden = !(mode === 'imagen' || dual);
    $('visDoc').hidden = mode !== 'doc';
    document.querySelectorAll('#cabecera .seg button').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-v') === mode);
    });
    if (dual) { $('panel').hidden = true; $('btnPanelAbrir').hidden = false; }
    if (!$('visMapa').hidden && map && mapReady) {
      setTimeout(() => { map.resize(); if (currentVista) ajustarEncuadreVista(currentVista, true); }, 80);
    }
    if (!$('visImagen').hidden && window.fitImageZoomer) setTimeout(() => window.fitImageZoomer(), 80);
  }

  // ------------------------------------------------------ ficha del elemento
  function renderFicha(item) {
    const f = $('ficha');
    if (!f) return;
    const vista = item.vista && VISTAS[item.vista];
    const ruta = (item.ruta || []).map((r) => `<li>${esc(r)}</li>`).join('');

    const rel = [];
    if (item.rel && ITEMS_MAP.get(item.rel)) rel.push(ITEMS_MAP.get(item.rel));
    (CATALOGO.items || []).forEach((o) => {
      if (o.id !== item.id && o.seccion === item.seccion && !rel.includes(o) && rel.length < 8) rel.push(o);
    });
    const relHtml = rel
      .map((o) => `<a class="rel" href="#/${o.id}"><i class="pt t-${o.tipo}"></i><b>${esc(etiquetaCorta(o))}</b><span>${esc(o.titulo)}</span></a>`)
      .join('');

    let tecnico = '';
    if (vista) {
      tecnico += `
        <h4>Datos del mapa</h4>
        <dl>
          <dt>Proyecto QGIS</dt><dd><code>${esc(vista.proyecto || '')}</code></dd>
          ${vista.layout ? `<dt>Composición</dt><dd>${esc(vista.layout)}</dd>` : ''}
          <dt>Sistema de referencia</dt><dd>${esc(vista.crs_mapa || '')}</dd>
          <dt>Capas publicadas</dt><dd>${vista.capas.length}</dd>
        </dl>`;
    }
    if (item.lamina) {
      tecnico += `
        <h4>Lámina del atlas</h4>
        <dl>
          <dt>Archivo de origen</dt><dd><code>${esc(item.lamina.origen || '')}</code></dd>
          ${item.lamina.pdf ? `<dt>Versión PDF</dt><dd><code>${esc(item.lamina.pdf)}</code></dd>` : ''}
        </dl>`;
    }

    f.innerHTML = `
      <div class="ficha-cab">
        <strong>Ficha</strong>
        <button class="ico-btn" id="fichaCerrar" aria-label="Cerrar ficha">${ICO.cerrar}</button>
      </div>
      <div class="ficha-cuerpo">
        <div class="ficha-eti"><i class="pt t-${item.tipo}"></i>${esc(item.etiqueta)}</div>
        <h3>${esc(item.titulo)}</h3>
        ${item.nota ? `<h4>Nota y fuente</h4><p class="ficha-nota">${esc(item.nota)}</p>` : '<p class="ayuda">Este elemento no tiene nota en el manuscrito.</p>'}
        <h4>Ubicación en la tesis</h4>
        <ol class="ficha-ruta">${ruta}</ol>
        ${tecnico}
        ${item._inst && item._inst.length ? `<h4>Entidades citadas como fuente</h4>${logosDe(item, 'logos-fila')}` : ''}
        ${relHtml ? `<h4>En el mismo apartado</h4><div class="rels">${relHtml}</div>` : ''}
        <h4>Enlace permanente</h4>
        <div class="url">${esc(enlaceDe(item))}</div>
        <button class="btn" id="fichaCopiar">${ICO.copiar} Copiar enlace</button>
      </div>
    `;
    $('fichaCerrar').addEventListener('click', () => { f.hidden = true; });
    $('fichaCopiar').addEventListener('click', () => copiar(enlaceDe(item), 'Enlace copiado'));
  }

  const RUTA_ALIAS = {
    'tabla-74-mapa': 'fig-66',
    'mapa-ufp': 'fig-66',
    'ufp': 'fig-66',
    'densidad': 'mapa-densidad-poblacional',
    'densidad-poblacional': 'mapa-densidad-poblacional',
    'accesibilidad': 'mapa-accesibilidad-puerto',
    'isocronas': 'mapa-accesibilidad-puerto',
    'gradiente': 'mapa-gradiente-usos',
    'corredores': 'mapa-corredores-mercancias'
  };

  // -------------------------------------------- detalle de un elemento
  async function showElement(id) {
    if (RUTA_ALIAS[id]) {
      navigate(`#/${RUTA_ALIAS[id]}`);
      return;
    }
    const item = ITEMS_MAP.get(id);
    if (!item) {
      console.warn('Elemento no encontrado en el catálogo:', id);
      navigate('#/');
      return;
    }
    currentItem = item;
    showPage('pgElemento');
    document.title = `${item.etiqueta}: ${item.titulo} · GeoInterfaz`;
    marcarEnIndice(id);

    const hasMapa = Boolean(item.vista && VISTAS[item.vista]);
    const hasLamina = Boolean(item.lamina && item.lamina.src);
    const hasFiguraImg = Boolean(item.imagenes && item.imagenes.length);
    const hasImagen = hasLamina || hasFiguraImg;
    const hasTabla = Boolean(item.tabla);

    const modos = [];
    if (hasMapa) modos.push(['mapa', ICO.mapa, 'Mapa interactivo']);
    if (hasImagen) modos.push(['imagen', ICO.imagen, hasLamina ? 'Lámina' : 'Figura']);
    if (hasMapa && hasImagen) modos.push(['dual', ICO.dual, 'Comparar']);
    if (hasTabla) modos.push(['doc', ICO.tabla, 'Tabla']);
    const segHtml = modos.length > 1
      ? `<div class="seg" role="group" aria-label="Cambiar vista">${modos.map((m) => `<button data-v="${m[0]}">${m[1]}<span>${m[2]}</span></button>`).join('')}</div>`
      : '';

    const cap = capDe(item);
    const miga = [cap ? `Cap. ${cap.num} · ${capNombre(cap)}` : 'Tesis doctoral'];
    if (item.ruta && item.ruta.length > 1) miga.push(item.ruta[item.ruta.length - 1]);

    const pos = ORDEN.indexOf(id);
    const ant = pos > 0 ? ITEMS_MAP.get(ORDEN[pos - 1]) : null;
    const sig = pos >= 0 && pos < ORDEN.length - 1 ? ITEMS_MAP.get(ORDEN[pos + 1]) : null;

    const relItem = item.rel ? ITEMS_MAP.get(item.rel) : null;

    $('cabecera').innerHTML = `
      <div class="cab-sup">
        <div class="miga" title="${esc((item.ruta || []).join(' › '))}">${miga.map(esc).join('<i>›</i>')}</div>
        <div class="paso">
          ${ant ? `<a href="#/${ant.id}" title="${esc(ant.etiqueta + ': ' + ant.titulo)}">${ICO.izq}<span>${esc(etiquetaCorta(ant))}</span></a>` : ''}
          <span class="paso-n">${pos + 1} / ${ORDEN.length}</span>
          ${sig ? `<a href="#/${sig.id}" title="${esc(sig.etiqueta + ': ' + sig.titulo)}"><span>${esc(etiquetaCorta(sig))}</span>${ICO.der}</a>` : ''}
        </div>
      </div>
      <h1><span class="eti t-${item.tipo}">${esc(item.etiqueta)}</span>${esc(item.titulo)}</h1>
      ${item.nota ? `<p class="nota-linea" id="notaLinea" title="Ver la nota completa">${esc(item.nota)}</p>` : ''}
      <div class="cab-inf">
        ${segHtml}
        <div class="acciones">
          ${relItem ? `<a class="btn" href="#/${relItem.id}" title="${esc(relItem.titulo)}"><i class="pt t-${relItem.tipo}"></i>${esc(relItem.etiqueta)}</a>` : ''}
          <button class="btn" id="btnPresentar" title="Modo presentación (P)">${ICO.pres}<span>Presentar</span></button>
          <button class="btn" id="btnFicha">${ICO.info}<span>Ficha</span></button>
          <button class="btn pri" id="btnCompartir">${ICO.compartir}<span>Citar</span></button>
        </div>
      </div>
    `;

    renderFicha(item);
    const ficha = $('ficha');
    ficha.hidden = true;
    const toggleFicha = () => { ficha.hidden = !ficha.hidden; };
    $('btnFicha').addEventListener('click', toggleFicha);
    $('btnPresentar').addEventListener('click', () => togglePresentacion());
    actualizarPresBarra(item, pos);
    guardarReciente(id);
    $('notaLinea')?.addEventListener('click', () => { ficha.hidden = false; });
    $('btnCompartir').addEventListener('click', () => openShareDialog(item));
    document.querySelectorAll('#cabecera .seg button').forEach((btn) => {
      btn.addEventListener('click', () => switchLienzoView(btn.getAttribute('data-v')));
    });

    const zoomImg = $('zoomImg');
    if (hasImagen) {
      zoomImg.src = `data/${hasLamina ? item.lamina.src : item.imagenes[0].src}`;
      zoomImg.alt = `${item.etiqueta}. ${item.titulo}`;
    } else {
      zoomImg.removeAttribute('src');
    }

    const visDoc = $('visDoc');
    visDoc.innerHTML = '';
    $('cajon').hidden = true;

    if (hasMapa) {
      switchLienzoView('mapa');
      loadVista(item.vista);
    } else if (hasImagen) {
      switchLienzoView('imagen');
    } else {
      switchLienzoView('doc');
    }

    if (hasTabla) {
      visDoc.innerHTML = '<div class="hoja"><p class="ayuda">Cargando tabla…</p></div>';
      try {
        const resp = await fetch(`data/${item.tabla}`, FRESCO);
        const tblHtml = await resp.text();
        if (currentItem !== item) return;
        let avisoMapaT73 = '';
        if (false) {  // aviso de una numeración anterior, ya sin uso
          avisoMapaT73 = `
            <div class="como" style="margin-bottom:14px;background:#eff6ff;border-color:#3b82f6;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <strong>🗺️ ¿Buscaba la cartografía de la propuesta de UFP?</strong>
                <span style="font-size:12px;color:#334155;display:block;margin-top:2px">El mapa oficial de la franja delimitada con propuesta de UFP es la <strong>Tabla 73</strong>.</span>
              </div>
              <a href="#/tabla-73" class="btn chico pri" style="text-decoration:none">🗺️ Ver Mapa Tabla 73</a>
            </div>`;
        }
        visDoc.innerHTML = `
          ${avisoMapaT73}
          <div class="hoja tesis-tabla">
            <div class="hoja-cab">
              <span>${esc(item.etiqueta)}</span>
              ${item.filas ? `<small>${item.filas} filas · ${item.cols} columnas</small>` : ''}
              ${item.filas > 6 ? '<input type="search" class="hoja-filtro" id="hojaFiltro" placeholder="Filtrar filas…" aria-label="Filtrar filas de la tabla">' : ''}
            </div>
            <div class="envoltura">${tblHtml}</div>
            ${item.nota ? `<p class="hoja-nota">${esc(item.nota)}</p>` : ''}
          </div>`;
        $('hojaFiltro')?.addEventListener('input', (ev) => {
          const q = ev.target.value.trim().toLowerCase();
          visDoc.querySelectorAll('.envoltura tr').forEach((tr, i) => {
            tr.hidden = Boolean(q) && i > 0 && !tr.textContent.toLowerCase().includes(q);
          });
        });
      } catch (_) {
        visDoc.innerHTML = '<div class="hoja"><p>No se pudo cargar la tabla.</p></div>';
      }
    } else if (!hasMapa && !hasImagen) {
      visDoc.innerHTML = `<div class="hoja"><p class="ayuda">Este elemento figura en el manuscrito sin imagen ni tabla asociada.</p>${item.nota ? `<p class="hoja-nota">${esc(item.nota)}</p>` : ''}</div>`;
    }
  }

  // ---------------------------------------------------------- inicio
  const IMPRESCINDIBLES = [
    'propuesta-paisaje-barranquilla',
    'propuesta-ortofotos-territorial',
    'propuesta-ortofotos-detalle',
    'propuesta-vistas-oblicuas',
    'fig-2',
    'fig-3',
    'fig-4',
    'atlas-3-4',
    'atlas-3-8',
    'mapa-densidad-poblacional',
    'atlas-3-12',
    'atlas-3-13',
    'fig-40',
    'fig-66',
    'mapa-accesibilidad-puerto',
    'mapa-gradiente-usos',
    'mapa-corredores-mercancias',
    'fig-52',
    'fig-56',
    'fig-63'
  ];

  function tarjeta(it) {
    const img = it.mini ? `data/${it.mini}` : it.lamina ? `data/${it.lamina.mini || it.lamina.src}` : it.imagenes && it.imagenes.length ? `data/${it.imagenes[0].src}` : 'logo_aida.svg';
    const v = it.vista && VISTAS[it.vista];
    const meta = v ? `Mapa interactivo · ${v.capas.length} capas` : it.lamina ? 'Lámina en alta resolución' : TIPOS[it.tipo] ? TIPOS[it.tipo].uno : '';
    return `
      <a class="tarjeta" href="#/${it.id}">
        <div class="tarjeta-img"><img loading="lazy" src="${esc(img)}" alt=""></div>
        <div class="tarjeta-txt">
          <span class="tarjeta-eti"><i class="pt t-${it.tipo}"></i>${esc(it.etiqueta)}</span>
          <strong>${esc(it.titulo)}</strong>
          <small>${esc(meta)}</small>
        </div>
      </a>`;
  }

  function pieEditorialHtml() {
    return `
      <footer class="pie-sitio">
        <div class="pie-sitio-inner">
          <div class="pie-sitio-izq">
            <div class="pie-marca">
              <img src="logo_aida.svg" alt="" width="22" height="22">
              <span><strong>GeoInterfaz</strong> · Geovisor de la Tesis Doctoral</span>
            </div>
            <div class="pie-meta">
              <span>Aida del Carmen Palmett Padilla · Universitat Politècnica de Catalunya (UPC)</span>
            </div>
          </div>

          <div class="pie-sitio-centro">
            <a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer" class="devgiz-badge" title="Visitar DevGiz · Ingeniería Geoespacial y Software">
              <span class="devgiz-by">Powered by</span>
              <img src="img/devgiz_lockup.svg" alt="DevGiz Engineering" class="devgiz-svg" width="94" height="28">
            </a>
          </div>

          <div class="pie-sitio-der">
            <nav class="pie-enlaces" aria-label="Enlaces del pie">
              <a href="#/datos">Capas y datos</a>
              <a href="#/acerca">Acerca de</a>
              <a href="descargas/Atlas_cartografico_GeoInterfaz.docx" download>Atlas (Word)</a>
              <a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer" class="pie-link-ext">devgiz.vercel.app ↗</a>
            </nav>
            <div class="pie-sub">Tecnología de Cartografía e Inteligencia Territorial</div>
          </div>
        </div>
      </footer>
    `;
  }

  function renderInicio() {
    const pg = $('pgInicio');
    if (!pg || pg.children.length > 0) return;

    const meta = CATALOGO.meta || {};
    const items = CATALOGO.items || [];
    const n = (f) => items.filter(f).length;
    const nMapas = n((i) => i.vista && VISTAS[i.vista]);
    const nLaminas = n((i) => i.lamina);
    const nFig = n((i) => i.tipo === 'grafico' || i.tipo === 'esquema');
    const nTablas = n((i) => i.clase === 'tabla');
    const nCapas = Object.keys(CAPAS || {}).length;

    const caps = (CATALOGO.capitulos || []).filter((c) => items.some((i) => i.capitulo === c.id));
    const visuales = (c) => items.filter((i) => i.capitulo === c.id && (i.tipo === 'mapa' || i.tipo === 'esquema'));
    const tabs = [`<button class="on" data-cap="clave">Imprescindibles</button>`]
      .concat(caps.map((c) => `<button data-cap="${c.id}" title="${esc(c.titulo)}">Cap. ${c.num}<span>${esc(capNombre(c))}</span></button>`))
      .join('');

    const primero = ITEMS_MAP.get('fig-3') || ITEMS_MAP.get('fig-3') || items.find((i) => i.vista);

    pg.innerHTML = `
      <div class="hero">
        <div class="hero-txt">
          <div class="sup">${esc(meta.universidad || '')} · ${esc(meta.programa || '')}</div>
          <h1>${esc(meta.titulo || '')}</h1>
          <p class="sub">${esc(meta.subtitulo || '')}</p>
          <p class="quien"><strong>${esc(meta.autora || '')}</strong><span>Dirección: ${esc(meta.directores || '')}</span><span class="credito-devgiz">· Desarrollado por <a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer"><strong>DevGiz</strong></a></span></p>
          <div class="hero-acc">
            ${primero ? `<a class="btn pri grande" href="#/${primero.id}">Explorar el área de estudio ${ICO.flecha}</a>` : ''}
            <button class="btn grande claro" id="btnHeroBuscar">Buscar en la tesis</button>
            <a class="btn grande claro" href="descargas/Atlas_cartografico_GeoInterfaz.docx" download title="Atlas con todos los mapas, por capítulo, tema y subtema (Word)">Descargar el atlas (Word)</a>
          </div>
        </div>
        <div class="cifras">
          <button data-filtro="mapa"><b>${nMapas}</b><span>mapas interactivos</span></button>
          <button data-filtro="mapa"><b>${nLaminas}</b><span>láminas del atlas</span></button>
          <button data-filtro="grafico"><b>${nFig}</b><span>figuras y esquemas</span></button>
          <button data-filtro="tabla"><b>${nTablas}</b><span>tablas</span></button>
          <a href="#/datos"><b>${nCapas}</b><span>capas geográficas</span></a>
        </div>
      </div>

      <div class="inicio-cuerpo">
        <section class="recientes" id="recientes" hidden></section>

        <section class="pasos">
          <div><b>1</b><div><strong>Elija qué ver</strong><span>Recorra la tesis por capítulos en el índice de la izquierda, o busque una figura o tabla por su número.</span></div></div>
          <div><b>2</b><div><strong>Explore el mapa</strong><span>Active capas, consulte la leyenda, haga clic sobre un elemento para ver sus datos y compare con la lámina impresa.</span></div></div>
          <div><b>3</b><div><strong>Cítelo</strong><span>Cada vista tiene un enlace permanente y un código QR para añadir a la nota del mapa en el manuscrito.</span></div></div>
        </section>

        <section class="recorrido">
          <div class="rec-cab">
            <h2>Cartografía de la tesis</h2>
            <div class="rec-tabs" id="recTabs">${tabs}</div>
          </div>
          <p class="rec-desc" id="recDesc"></p>
          <div class="rejilla" id="recGrid"></div>
          <div class="rec-pie" id="recPie"></div>
        </section>

        ${muroInst(true)}

        ${pieEditorialHtml()}
      </div>
    `;

    function pintar(capId) {
      let lista;
      let desc;
      let pie = '';
      if (capId === 'clave') {
        lista = IMPRESCINDIBLES.map((i) => ITEMS_MAP.get(i)).filter(Boolean);
        desc = 'Ocho vistas para entender la investigación de principio a fin: del área de estudio a la propuesta.';
      } else {
        const c = caps.find((x) => x.id === capId);
        lista = visuales(c);
        const resto = items.filter((i) => i.capitulo === capId).length - lista.length;
        desc = c.titulo.replace(/^CAPÍTULO\s+[IVX]+:\s*/i, '');
        desc = desc.charAt(0) + desc.slice(1).toLowerCase();
        desc = desc.replace(/(barranquilla|veracruz|santos|valparaíso)/g, (m) => m.charAt(0).toUpperCase() + m.slice(1));
        if (resto > 0) pie = `<button class="btn" data-abrir-cap="${capId}">Ver también las ${resto} tablas y figuras de este capítulo en el índice</button>`;
        if (!lista.length) desc += '. Este capítulo no tiene cartografía; sus tablas y figuras están en el índice.';
      }
      $('recDesc').textContent = desc;
      $('recGrid').innerHTML = lista.map(tarjeta).join('');
      $('recPie').innerHTML = pie;
      $('recPie').querySelector('[data-abrir-cap]')?.addEventListener('click', () => abrirCapituloEnIndice(capId));
    }

    pg.querySelectorAll('#recTabs button').forEach((b) => {
      b.addEventListener('click', () => {
        pg.querySelectorAll('#recTabs button').forEach((x) => x.classList.toggle('on', x === b));
        pintar(b.getAttribute('data-cap'));
      });
    });
    pintar('clave');

    $('btnHeroBuscar')?.addEventListener('click', () => $('btnCmdOpen').click());
    pg.querySelectorAll('.cifras [data-filtro]').forEach((a) => {
      a.addEventListener('click', () => {
        document.querySelector(`#chips button[data-f="${a.getAttribute('data-filtro')}"]`)?.click();
        mostrarIndice(true);
      });
    });
  }

  // --- PÁGINA: CAPAS Y DATOS (#pgDatos) ---
  function renderDatos() {
    const pg = document.getElementById('pgDatos');
    if (!pg || pg.children.length > 0) return;

    const capasArray = Object.values(CAPAS || {});
    const nCapas = capasArray.length;

    let filasHtml = capasArray
      .map((c) => {
        const vistasTags = (c.vistas || [])
          .map((v) => ((VISTAS[v] && VISTAS[v].items) || []).map((iid) => (ITEMS_MAP.get(iid) ? `<a class="tag" href="#/${iid}">${esc(ITEMS_MAP.get(iid).etiqueta)}</a>` : '')).join(''))
          .join('');

        const camposHtml = (c.campos || [])
          .map((f) => `<div><b>${f.n}</b> <span>(${f.t})</span></div>`)
          .join('');

        return `
          <tr data-c="${c.id}" data-txt="${esc((nombreCapa(c.nombre) + ' ' + c.nombre + ' ' + c.geom + ' ' + (c.fuente || '')).toLowerCase())}">
            <td><strong>${esc(nombreCapa(c.nombre))}</strong><br><small class="ruta">${esc(c.nombre)}</small></td>
            <td><span class="tag">${c.geom}</span></td>
            <td class="num">${c.n ? c.n.toLocaleString('es-CO') : '—'}</td>
            <td>${c.crs || '—'}</td>
            <td><small>${c.fuente || 'SIG Tesis'}</small></td>
          </tr>
          <tr class="det" id="det_${c.id}" hidden>
            <td colspan="5">
              <div style="font-size:11.5px;color:var(--gris);margin-bottom:6px"><strong>Campos de la capa (${c.campos ? c.campos.length : 0}):</strong></div>
              <div class="campos">${camposHtml || '<i>Sin campos definidos</i>'}</div>
              <div style="margin-top:8px"><strong>Se usa en:</strong> ${vistasTags || '<i>Ninguna asignada</i>'}</div>
            </td>
          </tr>
        `;
      })
      .join('');

    const repData = CATALOGO.repositorio || [];
    const repHtml = repData
      .map(
        (r) => `
        <details>
          <summary><strong>${r.n}</strong> — <i>${r.desc}</i> <span>(${r.archivos} archivos · ${r.mb} MB)</span></summary>
          <ul>
            ${(r.hijos || [])
              .map(
                (h) => `
                <li>
                  <strong>${h.n}:</strong> ${h.archivos} archivos (${h.mb} MB) — <i>${h.tipos}</i>
                </li>
              `
              )
              .join('')}
          </ul>
        </details>
      `
      )
      .join('');

    pg.innerHTML = `
      <div class="ancho">
        <h1>Capas y datos</h1>
        <p class="lead">
          Las ${nCapas} capas geográficas que alimentan los mapas, tal como están en los proyectos QGIS de la tesis. Haga clic en una capa para ver sus campos y en qué figuras se usa. Para publicarlas en la web se convirtieron a WGS 84 (EPSG:4326); el sistema de referencia de origen se indica en cada fila.
        </p>

        <div class="pest" role="tablist">
          <button class="on" data-tab="tabCapas">Capas vectoriales (${nCapas})</button>
          <button data-tab="tabRep">Estructura de carpetas de la investigación</button>
        </div>

        <div id="tabCapas">
          <input type="search" class="filtro-cat" id="filtroCapas" placeholder="Filtrar capas por nombre, tipo o fuente…">
          <table class="cat" id="tablaCat">
            <thead>
              <tr>
                <th>Capa / Archivo</th>
                <th>Tipo</th>
                <th class="num">Elementos</th>
                <th>Sistema de referencia</th>
                <th>Archivo de origen</th>
              </tr>
            </thead>
            <tbody>${filasHtml}</tbody>
          </table>
        </div>

        <div id="tabRep" hidden>
          <div class="arb-rep">${repHtml}</div>
        </div>

        ${pieEditorialHtml()}
      </div>
    `;

    const filtroIn = document.getElementById('filtroCapas');
    filtroIn?.addEventListener('input', () => {
      const q = filtroIn.value.trim().toLowerCase();
      document.querySelectorAll('#tablaCat tbody tr:not(.det)').forEach((tr) => {
        const txt = tr.getAttribute('data-txt') || '';
        const match = !q || txt.includes(q);
        tr.hidden = !match;
        const det = document.getElementById(`det_${tr.getAttribute('data-c')}`);
        if (det && !match) det.hidden = true;
      });
    });

    document.querySelectorAll('#tablaCat tbody tr:not(.det)').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
        const cid = tr.getAttribute('data-c');
        const det = document.getElementById(`det_${cid}`);
        if (det) det.hidden = !det.hidden;
      });
    });

    pg.querySelectorAll('.pest button').forEach((btn) => {
      btn.addEventListener('click', () => {
        pg.querySelectorAll('.pest button').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        const target = btn.getAttribute('data-tab');
        document.getElementById('tabCapas').hidden = target !== 'tabCapas';
        document.getElementById('tabRep').hidden = target !== 'tabRep';
      });
    });
  }

  // ------------------------------------------------------------ acerca de
  const FUENTES = [
    ['Colombia · Área Metropolitana de Barranquilla', 'Instituto Geográfico Agustín Codazzi (IGAC) · Departamento Administrativo Nacional de Estadística (DANE) · Área Metropolitana de Barranquilla (AMB, PEMOT) · Corporación Autónoma Regional del Atlántico (C.R.A., POMCA Ciénaga de Mallorquín) · Planes de Ordenamiento Territorial de Barranquilla, Soledad, Malambo, Galapa y Puerto Colombia'],
    ['México · Veracruz', 'INEGI · ASIPONA Veracruz · CONANP'],
    ['Chile · Valparaíso', 'Biblioteca del Congreso Nacional (BCN) · IDE Chile · DGA · MOP · CONAF · SENAPRED · ODEPA/CIREN · INE'],
    ['Brasil · Santos', 'IBGE · CETESB · IPT · Autoridade Portuária de Santos'],
    ['Cartografía de referencia', 'OpenStreetMap y colaboradores · Esri (fondos gris claro, gris oscuro e imagen satelital)']
  ];

  function renderAcerca() {
    const pg = $('pgAcerca');
    if (!pg || pg.children.length > 0) return;
    const meta = CATALOGO.meta || {};
    const nItems = (CATALOGO.items || []).filter((i) => !i.complementaria).length;

    pg.innerHTML = `
      <div class="ancho angosto">
        <h1>Acerca de este geovisor</h1>
        <p class="lead">GeoInterfaz reúne en un solo lugar la cartografía, las figuras y las tablas de la tesis para que puedan consultarse con más detalle del que permite la página impresa.</p>

        <h2>La tesis</h2>
        <table class="cat ficha-t">
          <tbody>
            <tr><th>Título</th><td>${esc(meta.titulo || '')}. ${esc(meta.subtitulo || '')}</td></tr>
            <tr><th>Doctoranda</th><td>${esc(meta.autora || '')}</td></tr>
            <tr><th>Dirección</th><td>${esc(meta.directores || '')}</td></tr>
            <tr><th>Programa</th><td>${esc(meta.programa || '')} · ${esc(meta.universidad || '')}</td></tr>
            <tr><th>Desarrollo de la plataforma</th><td><a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer"><strong>DevGiz</strong></a> (<a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer">https://devgiz.vercel.app/</a>)</td></tr>
            <tr><th>Manuscrito de referencia</th><td><code>${esc(meta.manuscrito || '')}</code></td></tr>
            <tr><th>Actualización del geovisor</th><td>${esc(meta.generado || '')}</td></tr>
          </tbody>
        </table>

        <h2>Qué contiene</h2>
        <p>Los ${nItems} elementos numerados del manuscrito (figuras, tablas, esquemas y láminas del atlas) conservan aquí su número, su título y su nota. Los mapas se reconstruyen a partir de los proyectos QGIS de la investigación, con la misma simbología y el mismo encuadre de la lámina impresa, y pueden compararse con ella en la pestaña «Lámina».</p>
        <p>El geovisor no añade interpretaciones ni datos ajenos a la investigación: todo lo que muestra procede del manuscrito y de las capas del sistema de información geográfico. Los elementos rotulados «Mapa complementario» o «Lámina complementaria» no están en el manuscrito; se elaboraron con esas mismas capas y su nota explica cómo.</p>

        <h2 id="descargas">Atlas cartográfico para descargar</h2>
        <p>Un solo documento con todos los mapas de la tesis, ordenados por capítulo, tema y subtema, cada uno con su imagen, su nota, su origen en QGIS y el enlace a su versión interactiva.</p>
        <p class="hero-acc">
          <a class="btn pri" href="descargas/Atlas_cartografico_GeoInterfaz.docx" download>Descargar en Word (.docx)</a>
          <a class="btn" href="descargas/Atlas_cartografico_GeoInterfaz.pdf" download>Descargar en PDF</a>
        </p>

        <h2>Cómo citar una vista</h2>
        <p>Cada elemento tiene una dirección propia, por ejemplo <code>#/fig-3</code>, <code>#/atlas-3-8</code> o <code>#/tabla-12</code>. El botón <strong>Citar</strong> entrega el enlace permanente, un código QR y un texto breve para añadir a la nota del mapa.</p>

        <h2>Fuentes de la información geográfica</h2>
        <p>Las entidades siguientes son la fuente de las capas, tal como se indica en la nota de cada mapa. Su mención no implica aval institucional del geovisor.</p>
        ${muroInst(false)}
        <table class="cat ficha-t">
          <tbody>${FUENTES.map((f) => `<tr><th>${esc(f[0])}</th><td>${esc(f[1])}</td></tr>`).join('')}</tbody>
        </table>

        <h2>Cómo está hecho y desarrollo</h2>
        <p>GeoInterfaz fue concebido y desarrollado por <a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer"><strong>DevGiz</strong></a> (<a href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer">devgiz.vercel.app</a>) para convertir la producción científica, cartográfica y metodológica de la tesis en una plataforma web interactiva de alto rendimiento.</p>
        <ul>
          <li><strong>MapLibre GL JS</strong> para la renderización vectorial interactiva en el navegador con soporte de reproyección en vivo (EPSG:9377 / EPSG:4326).</li>
          <li><strong>QGIS</strong> para el análisis territorial espacial y el diseño cartográfico de las láminas oficiales (MAGNA-SIRGAS 2018 / Origen Nacional, EPSG:9377).</li>
          <li><strong>Python, GeoPandas y Turf.js</strong> para el procesamiento de datos geográficos, mediciones espaciales y transformación de capas y estilos a especificaciones web.</li>
        </ul>

        <div class="tarjeta-devgiz">
          <div class="tarjeta-devgiz-logo">
            <img src="img/devgiz_lockup.svg" alt="DevGiz Engineering" width="116" height="34">
          </div>
          <div class="tarjeta-devgiz-txt">
            <strong>Desarrollado por DevGiz</strong>
            <p>Consultoría y desarrollo de software geoespacial, geovisores avanzados, cartografía digital y analítica territorial.</p>
          </div>
          <a class="btn pri" href="https://devgiz.vercel.app/" target="_blank" rel="noopener noreferrer">Visitar DevGiz ↗</a>
        </div>

        <p>La estructura completa de carpetas y capas de la investigación está en <a href="#/datos">Capas y datos</a>.</p>

        ${pieEditorialHtml()}
      </div>
    `;
  }

  // ------------------------------------------------- páginas e índice
  function showPage(pageId) {
    ['pgInicio', 'pgElemento', 'pgDatos', 'pgAcerca'].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = id !== pageId;
    });
    const mapaNav = { pgInicio: 'inicio', pgDatos: 'datos', pgAcerca: 'acerca' };
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('data-nav') === mapaNav[pageId]));
    if (window.innerWidth <= 900) $('indice')?.classList.remove('abierto');
    $('principal').scrollTop = 0;
  }

  function mostrarIndice(ver) {
    if (window.innerWidth <= 900) {
      $('indice').classList.toggle('abierto', ver === undefined ? undefined : ver);
    } else {
      const c = $('cuerpo');
      const oculto = ver === undefined ? !c.classList.contains('sin-indice') : !ver;
      c.classList.toggle('sin-indice', oculto);
      setTimeout(() => { if (map && mapReady) map.resize(); }, 240);
    }
  }

  function renderArbol() {
    const arbol = $('arbol');
    if (!arbol || !CATALOGO) return;
    arbol.innerHTML = '';
    const items = CATALOGO.items || [];
    ORDEN = [];

    (CATALOGO.capitulos || []).forEach((cap) => {
      const capItems = items.filter((it) => it.capitulo === cap.id);
      if (!capItems.length) return;

      const det = document.createElement('details');
      det.className = 'cap';
      det.setAttribute('data-cap', cap.id);
      det.innerHTML = `
        <summary title="${esc(cap.titulo)}">
          <span class="rom">${esc(cap.num)}</span>
          <span class="tit">${esc(capNombre(cap))}</span>
          <span class="n">${capItems.length}</span>
        </summary>
        <div class="cap-items"></div>`;
      const cont = det.querySelector('.cap-items');

      let secActual = null;
      capItems.forEach((it) => {
        ORDEN.push(it.id);
        const sec = it.ruta && it.ruta.length > 1 ? it.ruta[1] : '';
        if (sec !== secActual) {
          secActual = sec;
          if (sec) {
            const h = document.createElement('div');
            h.className = 'sec';
            h.textContent = sec;
            cont.appendChild(h);
          }
        }
        const a = document.createElement('a');
        a.className = 'it';
        a.href = `#/${it.id}`;
        a.setAttribute('data-id', it.id);
        a.setAttribute('data-tipo', it.tipo);
        a.setAttribute('data-txt', `${it.etiqueta} ${it.titulo} ${(it.ruta || []).join(' ')}`.toLowerCase());
        a.title = `${it.etiqueta}. ${it.titulo}`;
        a.innerHTML = `<i class="pt t-${it.tipo}"></i><span class="eti">${esc(etiquetaCorta(it))}</span><span class="txt">${esc(it.titulo)}</span>`;
        cont.appendChild(a);
      });

      // acordeón: un solo capítulo abierto a la vez mientras no se esté filtrando
      det.addEventListener('toggle', () => {
        if (det.open && !arbol.classList.contains('filtrando')) {
          arbol.querySelectorAll('details.cap[open]').forEach((o) => { if (o !== det) o.open = false; });
        }
      });
      arbol.appendChild(det);
    });

    const vacio = document.createElement('p');
    vacio.className = 'ayuda vacio';
    vacio.id = 'arbolVacio';
    vacio.hidden = true;
    vacio.textContent = 'Nada coincide con el filtro.';
    arbol.appendChild(vacio);

    initFiltroIndice();
  }

  function marcarEnIndice(id) {
    document.querySelectorAll('#arbol .it').forEach((el) => el.classList.toggle('on', el.getAttribute('data-id') === id));
    const link = document.querySelector(`#arbol .it[data-id="${id}"]`);
    if (!link) return;
    const cap = link.closest('details.cap');
    if (cap && !cap.open) cap.open = true;
    setTimeout(() => link.scrollIntoView({ block: 'nearest' }), 30);
  }

  function abrirCapituloEnIndice(capId) {
    mostrarIndice(true);
    document.querySelector('#chips button[data-f="todos"]')?.click();
    const det = document.querySelector(`#arbol details.cap[data-cap="${capId}"]`);
    if (det) {
      det.open = true;
      det.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function initFiltroIndice() {
    const buscar = $('buscar');
    const chips = $('chips');
    const arbol = $('arbol');
    let filtroTipo = 'todos';

    function filtrar() {
      const q = (buscar.value || '').trim().toLowerCase();
      const activo = Boolean(q) || filtroTipo !== 'todos';
      arbol.classList.toggle('filtrando', activo);
      let total = 0;

      arbol.querySelectorAll('details.cap').forEach((cap) => {
        let nCap = 0;
        let secEl = null;
        let nSec = 0;
        const cerrarSec = () => { if (secEl) secEl.hidden = nSec === 0; };
        cap.querySelectorAll('.cap-items > *').forEach((el) => {
          if (el.classList.contains('sec')) {
            cerrarSec();
            secEl = el;
            nSec = 0;
            return;
          }
          const ok = (filtroTipo === 'todos' || el.getAttribute('data-tipo') === filtroTipo) && (!q || (el.getAttribute('data-txt') || '').includes(q));
          el.hidden = !ok;
          if (ok) { nCap++; nSec++; }
        });
        cerrarSec();
        cap.hidden = nCap === 0;
        cap.querySelector('.n').textContent = nCap;
        if (activo) cap.open = nCap > 0 && (Boolean(q) || nCap <= 30);
        total += nCap;
      });
      $('arbolVacio').hidden = total > 0;
      if (!activo && currentItem && !$('pgElemento').hidden) marcarEnIndice(currentItem.id);
    }

    buscar.addEventListener('input', filtrar);
    chips.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
        filtroTipo = btn.getAttribute('data-f') || 'todos';
        filtrar();
      });
    });
  }

  // ----------------------------------------------------------- enrutador
  function router() {
    const hash = window.location.hash || '#/';
    const limpiar = () => document.querySelectorAll('#arbol .it').forEach((el) => el.classList.remove('on'));

    if (hash === '#/' || hash === '#' || hash === '') {
      renderInicio();
      showPage('pgInicio');
      document.title = 'GeoInterfaz · Geovisor de la tesis doctoral';
      currentItem = null;
      pintarRecientes();
      limpiar();
    } else if (hash === '#/datos') {
      renderDatos();
      showPage('pgDatos');
      document.title = 'Capas y datos · GeoInterfaz';
      currentItem = null;
      limpiar();
    } else if (hash === '#/acerca') {
      renderAcerca();
      showPage('pgAcerca');
      document.title = 'Acerca de · GeoInterfaz';
      currentItem = null;
      limpiar();
    } else {
      showElement(decodeURIComponent(hash.replace(/^#\//, '')));
    }
  }

  function navigate(hash) {
    if (window.location.hash === hash) router();
    else window.location.hash = hash;
  }

  // --- HERRAMIENTA DE MEDICIÓN ESPACIAL INTERACTIVA (TURF.JS) ---
  let modoMedicion = false;
  let puntosMedicion = [];
  const srcMedicionId = 'src_medicion_interactiva';

  function initHerramientaMedicion() {
    const btnMedir = document.getElementById('btnMedir');
    const hud = document.getElementById('medicionHud');
    const txt = document.getElementById('medTexto');
    const btnLimpiar = document.getElementById('btnLimpiarMed');
    const btnCerrar = document.getElementById('btnCerrarMed');

    if (!btnMedir || !hud) return;

    btnMedir.addEventListener('click', () => {
      toggleMedicion(!modoMedicion);
    });

    btnLimpiar?.addEventListener('click', () => {
      puntosMedicion = [];
      actualizarMedicionGeoJSON();
      if (txt) txt.textContent = 'Haga clic en el mapa para marcar puntos de medición';
    });

    btnCerrar?.addEventListener('click', () => {
      toggleMedicion(false);
    });
  }

  function toggleMedicion(activar) {
    modoMedicion = activar;
    const btnMedir = document.getElementById('btnMedir');
    const hud = document.getElementById('medicionHud');
    const txt = document.getElementById('medTexto');
    if (btnMedir) btnMedir.classList.toggle('on', modoMedicion);
    if (hud) hud.hidden = !modoMedicion;

    if (!modoMedicion) {
      puntosMedicion = [];
      limpiarMedicionCapas();
      if (map) map.getCanvas().style.cursor = '';
    } else {
      if (txt) txt.textContent = 'Haga clic en el mapa para marcar puntos de medición (distancia / área)';
      asegurarMedicionCapas();
      if (map) map.getCanvas().style.cursor = 'crosshair';
    }
  }

  function asegurarMedicionCapas() {
    if (!map || !mapReady) return;
    if (!map.getSource(srcMedicionId)) {
      map.addSource(srcMedicionId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!map.getLayer('lyr_med_fill')) {
      map.addLayer({
        id: 'lyr_med_fill',
        type: 'fill',
        source: srcMedicionId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#38bdf8',
          'fill-opacity': 0.25
        }
      });
    }
    if (!map.getLayer('lyr_med_line')) {
      map.addLayer({
        id: 'lyr_med_line',
        type: 'line',
        source: srcMedicionId,
        paint: {
          'line-color': '#0284c7',
          'line-width': 2.5,
          'line-dasharray': [2, 2]
        }
      });
    }
    if (!map.getLayer('lyr_med_points')) {
      map.addLayer({
        id: 'lyr_med_points',
        type: 'circle',
        source: srcMedicionId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0284c7',
          'circle-stroke-width': 2.5
        }
      });
    }
  }

  function limpiarMedicionCapas() {
    if (!map || !mapReady) return;
    ['lyr_med_points', 'lyr_med_line', 'lyr_med_fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(srcMedicionId)) map.removeSource(srcMedicionId);
  }

  function actualizarMedicionGeoJSON() {
    if (!map || !mapReady) return;
    const src = map.getSource(srcMedicionId);
    if (!src) return;

    const features = [];
    puntosMedicion.forEach((pt) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pt }
      });
    });

    if (puntosMedicion.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: puntosMedicion }
      });
    }

    if (puntosMedicion.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...puntosMedicion, puntosMedicion[0]]] }
      });
    }

    src.setData({ type: 'FeatureCollection', features });

    const txt = document.getElementById('medTexto');
    if (!txt) return;

    if (puntosMedicion.length === 1) {
      txt.textContent = '1 vértice marcado · Haga clic para medir distancia al siguiente punto';
    } else if (puntosMedicion.length >= 2) {
      let distKm = 0;
      let areaTxt = '';
      if (window.turf) {
        try {
          const line = turf.lineString(puntosMedicion);
          distKm = turf.length(line, { units: 'kilometers' });
          if (puntosMedicion.length >= 3) {
            const poly = turf.polygon([[...puntosMedicion, puntosMedicion[0]]]);
            const m2 = turf.area(poly);
            const ha = (m2 / 10000).toFixed(2);
            const km2 = (m2 / 1000000).toFixed(3);
            areaTxt = ` | Área: ${ha} ha (${km2} km²)`;
          }
        } catch (_) {}
      }

      const distTxt = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(2)} km`;
      txt.textContent = `Longitud: ${distTxt}${areaTxt} · (${puntosMedicion.length} vértices)`;
    }
  }

  // ---------------------------------------------------- vista en perspectiva
  let modo3D = false;
  function init3DToggle() {
    const btn3D = $('btn3D');
    if (!btn3D) return;
    btn3D.addEventListener('click', () => {
      if (!map || !mapReady) return;
      modo3D = !modo3D;
      btn3D.classList.toggle('on', modo3D);
      map.easeTo(modo3D ? { pitch: 55, bearing: -15, duration: 900 } : { pitch: 0, bearing: 0, duration: 900 });
    });
  }

  // ---------------------------------- ir a un lugar (encuadres de la propia tesis)
  const LUGARES = [
    ['Área de estudio', [['Área Metropolitana de Barranquilla', 'fig-2'], ['Franja de interfaz urbano-rural', 'fig-3'], ['Ciénaga de Mallorquín', 'fig-4']]],
    ['Propuesta', [['Nodo 1 · Puerto Colombia', 'fig-57'], ['Nodo 2 · Galapa', 'fig-58'], ['Nodo 3 · Barranquilla - Galapa', 'fig-59'], ['Nodo 4 · Malambo', 'fig-60'], ['Nuevo puerto interior', 'fig-61']]],
    ['Casos comparados', [['Veracruz', 'fig-40'], ['Valparaíso', 'fig-43'], ['Santos', 'fig-46']]]
  ];

  function initSaltosRapidos() {
    const btn = $('btnSaltos');
    const menu = $('menuSaltos');
    if (!btn || !menu) return;

    let html = '';
    LUGARES.forEach(([grupo, lugares]) => {
      const ok = lugares.filter(([, id]) => {
        const it = ITEMS_MAP.get(id);
        return it && it.vista && VISTAS[it.vista] && VISTAS[it.vista].bbox;
      });
      if (!ok.length) return;
      html += `<div class="h-menu-tit">${esc(grupo)}</div>` + ok.map(([n, id]) => `<button data-salto="${id}">${esc(n)}</button>`).join('');
    });
    menu.innerHTML = html;

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', () => { menu.hidden = true; });
    menu.querySelectorAll('button[data-salto]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = ITEMS_MAP.get(b.getAttribute('data-salto'));
        if (it && map && mapReady) ajustarEncuadre(VISTAS[it.vista].bbox);
      });
    });
  }

  // ---------------------------------------------------- imagen del mapa
  function initCapturaMapa() {
    const btn = $('btnCapturaMapa');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!map || !mapReady) return;
      try {
        const mc = map.getCanvas();
        const k = mc.width / mc.clientWidth;
        const sup = Math.round(52 * k);
        const inf = Math.round(30 * k);
        const out = document.createElement('canvas');
        out.width = mc.width;
        out.height = mc.height + sup + inf;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(mc, 0, sup);
        ctx.fillStyle = '#0f2a43';
        ctx.font = `600 ${Math.round(15 * k)}px "Plus Jakarta Sans", sans-serif`;
        const tit = currentItem ? `${currentItem.etiqueta}. ${currentItem.titulo}` : 'GeoInterfaz';
        ctx.fillText(tit.length > 110 ? tit.slice(0, 108) + '…' : tit, Math.round(18 * k), Math.round(32 * k));
        ctx.fillStyle = '#64748b';
        ctx.font = `${Math.round(11 * k)}px "Plus Jakarta Sans", sans-serif`;
        const pie = `${(CATALOGO.meta || {}).autora || ''} · Tesis doctoral, UPC · ${currentItem ? enlaceDe(currentItem) : ''}`;
        ctx.fillText(pie, Math.round(18 * k), out.height - Math.round(11 * k));

        const link = document.createElement('a');
        link.download = `GeoInterfaz_${currentItem ? currentItem.id : 'mapa'}.png`;
        link.href = out.toDataURL('image/png');
        link.click();
        showToast('Imagen del mapa guardada');
      } catch (err) {
        console.warn('No se pudo capturar el mapa:', err);
        showToast('No se pudo generar la imagen en este navegador');
      }
    });
  }

  // --- COMMAND PALETTE (CTRL+K / /) SPOTLIGHT SEARCH ---
  function initCommandPalette() {
    const dlg = document.getElementById('cmdPalette');
    const input = document.getElementById('cmdInput');
    const resEl = document.getElementById('cmdResultados');
    const btnOpen = document.getElementById('btnCmdOpen');
    if (!dlg || !input || !resEl) return;

    btnOpen?.addEventListener('click', () => abrirPalette());

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrirPalette();
      } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        abrirPalette();
      } else if (e.key === 'Escape' && dlg.open) {
        dlg.close();
      } else if (e.key.toLowerCase() === 'm' && !dlg.open && document.activeElement.tagName !== 'INPUT') {
        toggleMedicion(!modoMedicion);
      } else if (e.key === '3' && !dlg.open && document.activeElement.tagName !== 'INPUT') {
        document.getElementById('btn3D')?.click();
      }
    });

    function abrirPalette() {
      input.value = '';
      renderizarResultadosPalette('');
      dlg.showModal();
      input.focus();
    }

    input.addEventListener('input', () => {
      renderizarResultadosPalette(input.value.trim().toLowerCase());
    });

    let itemsFiltrados = [];
    let indiceSeleccionado = 0;

    function renderizarResultadosPalette(q) {
      if (!CATALOGO || !CATALOGO.items) return;
      itemsFiltrados = CATALOGO.items.filter((it) => {
        if (!q) return true;
        const texto = `${it.etiqueta} ${it.titulo} ${it.clase} ${it.ruta?.join(' ')}`.toLowerCase();
        return texto.includes(q);
      }).slice(0, 30);

      indiceSeleccionado = 0;
      if (itemsFiltrados.length === 0) {
        resEl.innerHTML = '<div class="cmd-vacio">No se encontraron elementos coincidentes en la investigación</div>';
        return;
      }

      resEl.innerHTML = itemsFiltrados.map((it, idx) => `
        <div class="cmd-item${idx === 0 ? ' activo' : ''}" data-idx="${idx}" data-id="${it.id}">
          <span class="cmd-item-eti">${it.etiqueta}</span>
          <span class="cmd-item-tit">${it.titulo}</span>
          <span class="cmd-item-cap">${it.tipo === 'mapa' ? 'mapa' : it.clase}</span>
        </div>
      `).join('');

      resEl.querySelectorAll('.cmd-item').forEach((el) => {
        el.addEventListener('click', () => {
          dlg.close();
          navigate(`#/${el.getAttribute('data-id')}`);
        });
      });
    }

    input.addEventListener('keydown', (e) => {
      const items = resEl.querySelectorAll('.cmd-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        indiceSeleccionado = (indiceSeleccionado + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle('activo', idx === indiceSeleccionado));
        items[indiceSeleccionado]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        indiceSeleccionado = (indiceSeleccionado - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle('activo', idx === indiceSeleccionado));
        items[indiceSeleccionado]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (itemsFiltrados[indiceSeleccionado]) {
          dlg.close();
          navigate(`#/${itemsFiltrados[indiceSeleccionado].id}`);
        }
      }
    });
  }

  // ------------------------------------------- entidades y logotipos
  // Los logotipos identifican a las entidades cuyos datos se citan en cada mapa (nota y capas).
  function prepararInst() {
    INST.forEach((e) => {
      e._re = (e.claves || []).map((c) => new RegExp(c));
      e._items = [];
    });
    (CATALOGO.items || []).forEach((it) => {
      const v = it.vista && VISTAS[it.vista];
      const t = [it.titulo, it.nota || '', v ? v.capas.map((c) => c.nombre).join(' | ') : ''].join(' | ');
      it._inst = INST.filter((e) => e._re.some((r) => r.test(t)));
      it._inst.forEach((e) => e._items.push(it));
    });
  }

  function logosDe(it, clase) {
    return `<div class="${clase}">${it._inst
      .map((e) => `<button class="logo-mini" data-inst="${e.id}" title="${esc(e.nombre)}"><img src="${e.logo}" alt="${esc(e.sigla)}" loading="lazy"></button>`)
      .join('')}</div>`;
  }

  function muroInst(conTitulo) {
    if (!INST.length) return '';
    const grupos = [];
    INST.forEach((e) => {
      let g = grupos.find((x) => x[0] === e.grupo);
      if (!g) { g = [e.grupo, []]; grupos.push(g); }
      g[1].push(e);
    });
    const html = grupos
      .map(([g, es]) => `
        <div class="inst-grupo">
          <div class="inst-pais">${esc(g)}</div>
          <div class="inst-fila">${es
            .map((e) => `
              <button class="inst" data-inst="${e.id}" title="${esc(e.nombre)}">
                <span class="inst-logo"><img src="${e.logo}" alt="${esc(e.nombre)}" loading="lazy"></span>
                <strong>${esc(e.sigla)}</strong>
                <small>${e._items.length ? `${e._items.length} ${e._items.length === 1 ? 'elemento' : 'elementos'}` : (e.grupo === 'Universidad' ? 'Universidad de la tesis' : 'Fuente cartográfica')}</small>
              </button>`)
            .join('')}</div>
        </div>`)
      .join('');
    return `
      <section class="instituciones">
        ${conTitulo ? '<div class="rec-cab"><h2>Entidades y fuentes de la cartografía</h2></div><p class="rec-desc">Las entidades cuyos datos sustentan los mapas de la tesis. Elija una para ver en qué figuras y tablas se cita.</p>' : ''}
        <div class="inst-muro">${html}</div>
        <p class="ayuda">Los logotipos identifican la procedencia de los datos, tal como se indica en la nota de cada mapa. No implican aval institucional.</p>
      </section>`;
  }

  function abrirInst(id) {
    const e = INST.find((x) => x.id === id);
    const dlg = $('dlg');
    if (!e || !dlg) return;
    const lista = e._items
      .map((o) => `<a class="rel" href="#/${o.id}"><i class="pt t-${o.tipo}"></i><b>${esc(etiquetaCorta(o))}</b><span>${esc(o.titulo)}</span></a>`)
      .join('');
    $('dlgCuerpo').innerHTML = `
      <div class="dlg-cab">
        <div class="inst-cab">
          <span class="inst-logo grande"><img src="${e.logo}" alt=""></span>
          <div><div class="dlg-sup">${esc(e.grupo)}</div><h3>${esc(e.nombre)}</h3><p class="ayuda">${esc(e.papel)}</p></div>
        </div>
        <button class="ico-btn" id="dlgCerrar" aria-label="Cerrar">${ICO.cerrar}</button>
      </div>
      ${lista ? `<label>Se cita en ${e._items.length} ${e._items.length === 1 ? 'elemento' : 'elementos'} de la tesis</label><div class="rels inst-lista">${lista}</div>` : ''}
      <p class="ayuda">El logotipo identifica la fuente de los datos; no implica aval institucional.</p>`;
    $('dlgCerrar').addEventListener('click', () => dlg.close());
    $('dlgCuerpo').querySelectorAll('a.rel').forEach((a) => a.addEventListener('click', () => dlg.close()));
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------- tema, presentación y ayudas
  function temaOscuro() {
    return document.documentElement.getAttribute('data-tema') === 'oscuro';
  }
  function setTema(oscuro) {
    document.documentElement.setAttribute('data-tema', oscuro ? 'oscuro' : 'claro');
    try { localStorage.setItem('gi-tema', oscuro ? 'oscuro' : 'claro'); } catch (_) { /* sin almacenamiento */ }
    if (map && mapReady && !baseManual && (currentBase === 'claro' || currentBase === 'oscuro')) setBaseMap(oscuro ? 'oscuro' : 'claro');
  }

  function enPresentacion() {
    return document.body.classList.contains('presenta');
  }
  function reajustarLienzo() {
    setTimeout(() => {
      if (map && mapReady && !$('visMapa').hidden) { map.resize(); if (currentVista) ajustarEncuadreVista(currentVista, true); }
      if (window.fitImageZoomer && !$('visImagen').hidden) window.fitImageZoomer();
    }, 320);
  }
  // Presentación: solo el contenido, a pantalla completa, para exponer la tesis pasando con las flechas.
  function togglePresentacion(on) {
    const v = on === undefined ? !enPresentacion() : on;
    if (v && !currentItem) return;
    document.body.classList.toggle('presenta', v);
    $('presBarra').hidden = !v;
    if (v) {
      $('ficha').hidden = true;
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    reajustarLienzo();
  }
  function actualizarPresBarra(item, pos) {
    $('presEti').textContent = item.etiqueta;
    $('presTit').textContent = item.titulo;
    $('presN').textContent = `${pos + 1} / ${ORDEN.length}`;
    $('presAnt').disabled = pos <= 0;
    $('presSig').disabled = pos >= ORDEN.length - 1;
  }

  function guardarReciente(id) {
    try {
      const r = JSON.parse(localStorage.getItem('gi-recientes') || '[]').filter((x) => x !== id);
      r.unshift(id);
      localStorage.setItem('gi-recientes', JSON.stringify(r.slice(0, 6)));
    } catch (_) { /* sin almacenamiento */ }
  }
  function pintarRecientes() {
    const c = $('recientes');
    if (!c) return;
    let r = [];
    try { r = JSON.parse(localStorage.getItem('gi-recientes') || '[]'); } catch (_) { /* sin almacenamiento */ }
    const its = r.map((i) => ITEMS_MAP.get(i)).filter(Boolean);
    c.hidden = !its.length;
    c.innerHTML = its.length
      ? '<span class="rec-lbl">Continuar donde lo dejó</span>' +
        its.map((o) => `<a class="chip" href="#/${o.id}" title="${esc(o.titulo)}"><i class="pt t-${o.tipo}"></i><b>${esc(etiquetaCorta(o))}</b><span>${esc(o.titulo)}</span></a>`).join('')
      : '';
  }

  function abrirAtajos() {
    const dlg = $('dlg');
    const filas = [
      ['Ctrl K', 'Buscar en toda la tesis'],
      ['Mayús ← →', 'Elemento anterior o siguiente'],
      ['P', 'Modo presentación (dentro de él bastan ← →)'],
      ['M', 'Medir distancia y área en el mapa'],
      ['3', 'Vista en perspectiva'],
      ['Esc', 'Cerrar ventanas o salir de la presentación']
    ];
    $('dlgCuerpo').innerHTML = `
      <div class="dlg-cab">
        <div><div class="dlg-sup">Ayuda</div><h3>Atajos de teclado</h3></div>
        <button class="ico-btn" id="dlgCerrar" aria-label="Cerrar">${ICO.cerrar}</button>
      </div>
      <dl class="atajos">${filas.map((f) => `<dt>${f[0].split(' ').map((k) => `<kbd>${k}</kbd>`).join(' ')}</dt><dd>${f[1]}</dd>`).join('')}</dl>`;
    $('dlgCerrar').addEventListener('click', () => dlg.close());
    if (!dlg.open) dlg.showModal();
  }

  function initExtras() {
    $('btnTema').addEventListener('click', () => setTema(!temaOscuro()));
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-inst]');
      if (b) abrirInst(b.getAttribute('data-inst'));
    });
    $('btnAtajos').addEventListener('click', abrirAtajos);
    $('presSalir').addEventListener('click', () => togglePresentacion(false));
    const paso = (d) => {
      if (!currentItem) return;
      const pos = ORDEN.indexOf(currentItem.id) + d;
      if (pos >= 0 && pos < ORDEN.length) navigate(`#/${ORDEN[pos]}`);
    };
    $('presAnt').addEventListener('click', () => paso(-1));
    $('presSig').addEventListener('click', () => paso(1));
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && enPresentacion()) togglePresentacion(false);
    });
    window.addEventListener('keydown', (e) => {
      const t = document.activeElement && document.activeElement.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === '?') abrirAtajos();
      if (e.key === 'Escape' && enPresentacion() && !document.querySelector('dialog[open]')) togglePresentacion(false);
    });
    const op = $('opGlobal');
    op.addEventListener('input', () => {
      opGlobal = parseFloat(op.value) / 100;
      $('opGlobalV').textContent = `${op.value}%`;
      if (currentVista) currentVista.capas.forEach(aplicarOpacidad);
    });
    window.addEventListener('resize', () => { if (currentItem) reajustarLienzo(); });
  }

  // Los datos se regeneran con cada versión del manuscrito: el navegador debe comprobar siempre si cambiaron
  // (si no cambiaron, el servidor responde 304 y se usa la copia local).
  const FRESCO = { cache: 'no-cache' };

  // ------------------------------------------------------------- inicio
  async function initApp() {
    try {
      const [resCat, resVis, resCap] = await Promise.all([
        fetch('data/catalogo.json', FRESCO),
        fetch('data/vistas.json', FRESCO),
        fetch('data/capas.json', FRESCO)
      ]);
      CATALOGO = await resCat.json();
      VISTAS = await resVis.json();
      CAPAS = await resCap.json();
      (CATALOGO.items || []).forEach((it) => ITEMS_MAP.set(it.id, it));
      try { INST = await (await fetch('data/instituciones.json', FRESCO)).json(); } catch (_) { INST = []; }
      prepararInst();

      renderArbol();
      initPanel();
      initZoomer();
      initCommandPalette();
      initHerramientaMedicion();
      init3DToggle();
      initSaltosRapidos();
      initCapturaMapa();
      initExtras();

      $('btnIndice').addEventListener('click', () => mostrarIndice());
      $('btnEncuadre').addEventListener('click', () => {
        if (modo3D) $('btn3D').click();
        if (currentVista) ajustarEncuadreVista(currentVista);
      });
      $('btnRotulos').addEventListener('click', () => setRotulos(!rotulosVisibles));
      $('cajonCerrar').addEventListener('click', () => { $('cajon').hidden = true; });
      $('dlg').addEventListener('click', (e) => { if (e.target === $('dlg')) $('dlg').close(); });

      // ← → para pasar al elemento anterior o siguiente
      window.addEventListener('keydown', (e) => {
        if (!currentItem || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = document.activeElement && document.activeElement.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
        const pos = ORDEN.indexOf(currentItem.id);
        const pres = enPresentacion();
        if (e.key === 'ArrowLeft' && (e.shiftKey || pres) && pos > 0) navigate(`#/${ORDEN[pos - 1]}`);
        if (e.key === 'ArrowRight' && (e.shiftKey || pres) && pos < ORDEN.length - 1) navigate(`#/${ORDEN[pos + 1]}`);
        if (e.key.toLowerCase() === 'p') togglePresentacion();
      });

      window.addEventListener('hashchange', router);
      router();
    } catch (err) {
      console.error('Error al iniciar el geovisor:', err);
      $('principal').innerHTML = `<div class="error-carga"><h2>No se pudieron cargar los datos del geovisor</h2><p>${esc(err.message)}</p></div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
})();
