/**
 * GEOVISOR DE LA TESIS DOCTORAL
 * "Enfoques y metodologías de planificación territorial local para el desarrollo
 * de franjas de interfaz rural-urbanas limítrofes en ciudades portuarias"
 * Autora: Aida del Carmen Palmett Padilla
 * Universitat Politècnica de Catalunya (UPC) — 2026
 *
 * Motor: MapLibre GL JS 4.7.1 + Proj4js + QRCode
 */

(function () {
  'use strict';

  // --- ESTADO GLOBAL ---
  let CATALOGO = null;
  let VISTAS = null;
  let CAPAS = null;
  const ITEMS_MAP = new Map();
  const GEOJSON_CACHE = new Map();

  let map = null;
  let mapReady = false;
  let currentVista = null;
  let currentItem = null;
  let currentBase = 'osm';
  let activeVectorLayerIds = [];
  let activeVectorSourceIds = [];

  // Estado del visor de láminas / imágenes (pan & zoom)
  const zoomState = {
    x: 0,
    y: 0,
    scale: 1,
    isDragging: false,
    startX: 0,
    startY: 0,
    imgW: 0,
    imgH: 0
  };

  // Fuentes de mapas base soportadas
  const BASES = {
    osm: {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19
    },
    sat: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
      maxzoom: 19
    },
    claro: {
      tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxzoom: 20
    },
    oscuro: {
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxzoom: 20
    },
    nada: null
  };

  // Inicialización de Proj4 para el sistema oficial colombiano EPSG:9377
  if (window.proj4) {
    proj4.defs(
      'EPSG:9377',
      '+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
    );
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

  // --- AVISOS Y DIÁLOGOS ---
  function showToast(txt) {
    const aviso = document.getElementById('aviso');
    if (!aviso) return;
    aviso.textContent = txt;
    aviso.classList.add('ver');
    setTimeout(() => {
      aviso.classList.remove('ver');
    }, 2500);
  }

  function openShareDialog(item) {
    const dlg = document.getElementById('dlg');
    const cuerpo = document.getElementById('dlgCuerpo');
    if (!dlg || !cuerpo) return;

    const deepLink = `${window.location.origin}${window.location.pathname}#/${item.id}`;
    let qrHtml = '';
    if (typeof qrcode !== 'undefined') {
      try {
        const qr = qrcode(0, 'M');
        qr.addData(deepLink);
        qr.make();
        qrHtml = qr.createImgTag(4);
      } catch (err) {
        console.warn('Error generando QR:', err);
      }
    }

    const notaSugerida = item.tipo === 'mapa'
      ? `Nota. Para consultar este mapa de forma interactiva con todas sus capas cartográficas, encuadre original y tablas de atributos espaciales, ver Geovisor oficial: ${deepLink}`
      : `Nota. Para consultar este elemento en versión digital de alta resolución, ver Geovisor de la tesis: ${deepLink}`;

    cuerpo.innerHTML = `
      <h3>Compartir y citar en la tesis</h3>
      <p style="font-size:12.5px;color:var(--gris);margin-bottom:14px">
        Utilice este enlace o código QR en el manuscrito para que su director y jurados exploren interactivamente este elemento en el Geovisor oficial.
      </p>
      <div class="qr">
        ${qrHtml || '<div style="width:160px;height:160px;background:#eee;display:flex;align-items:center;justify-content:center">QR</div>'}
        <div style="flex:1;min-width:0">
          <label style="font-size:11px;font-weight:600;color:var(--gris);display:block;margin-bottom:3px">ENLACE DIRECTO (PERMALINK)</label>
          <div class="url">${deepLink}</div>
          <button class="btn pri chico" id="btnCopiarUrl" style="margin-top:6px">📋 Copiar enlace</button>
        </div>
      </div>
      <div style="margin-top:14px">
        <label style="font-size:11px;font-weight:600;color:var(--gris);display:block;margin-bottom:3px">TEXTO SUGERIDO PARA LA NOTA A PIE DE MAPA</label>
        <textarea id="txtNota" readonly style="margin-top:4px;height:70px">${notaSugerida}</textarea>
        <div style="margin-top:6px;text-align:left">
          <button class="btn chico" id="btnCopiarNota">📋 Copiar texto para la nota</button>
        </div>
      </div>
    `;

    document.getElementById('btnCopiarUrl')?.addEventListener('click', () => {
      navigator.clipboard.writeText(deepLink).then(() => showToast('¡Enlace copiado al portapapeles!'));
    });
    document.getElementById('btnCopiarNota')?.addEventListener('click', () => {
      navigator.clipboard.writeText(notaSugerida).then(() => showToast('¡Texto de la nota copiado!'));
    });

    dlg.showModal();
  }

  // --- MOTOR CARTOGRÁFICO (MAPLIBRE GL) ---
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
              tiles: BASES.osm.tiles,
              tileSize: 256,
              attribution: BASES.osm.attribution,
              maxzoom: BASES.osm.maxzoom
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#e6edf2' }
            },
            {
              id: 'base-layer',
              type: 'raster',
              source: 'base-source',
              paint: { 'raster-opacity': 1.0 }
            }
          ]
        },
        center: [-74.80, 10.98],
        zoom: 11,
        attributionControl: true
      });

      window._testMap = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
      map.addControl(new maplibregl.FullscreenControl(), 'top-left');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

      const coordEl = document.getElementById('coord');
      map.on('mousemove', (e) => {
        if (!coordEl) return;
        const lng = e.lngLat.lng;
        const lat = e.lngLat.lat;
        let extra = '';
        if (window.proj4) {
          try {
            const pt9377 = proj4('EPSG:4326', 'EPSG:9377', [lng, lat]);
            extra = ` | Origen Nal: N ${Math.round(pt9377[1]).toLocaleString('es-CO')} m, E ${Math.round(pt9377[0]).toLocaleString('es-CO')} m`;
          } catch (_) {}
        }
        coordEl.textContent = `Lat: ${lat.toFixed(5)}°, Lon: ${lng.toFixed(5)}°${extra}`;
      });

      map.on('mouseout', () => {
        if (coordEl) coordEl.textContent = '';
      });

      const tooltipEl = document.getElementById('mapTooltip');
      map.on('click', (e) => {
        if (modoMedicion) {
          puntosMedicion.push([e.lngLat.lng, e.lngLat.lat]);
          actualizarMedicionGeoJSON();
          return;
        }

        const visibleLayers = activeVectorLayerIds.filter((id) => {
          const l = map.getLayer(id);
          return l && map.getLayoutProperty(id, 'visibility') !== 'none' && !id.endsWith('__label');
        });
        if (!visibleLayers.length) return;

        const features = map.queryRenderedFeatures(e.point, { layers: visibleLayers });
        if (!features || !features.length) return;

        const f = features[0];
        const props = f.properties || {};

        let layerObj = null;
        if (currentVista && currentVista.capas) {
          const match = f.layer.id.match(/^lyr_(\d+)_/);
          if (match) {
            const idx = parseInt(match[1], 10);
            layerObj = currentVista.capas[idx];
          } else {
            layerObj = currentVista.capas.find((c) => f.layer.id.includes(c.capa));
          }
        }
        const layerName = layerObj ? layerObj.nombre : 'Capa';
        const tit = props.NOMBRE || props.Nombre || props.nombre || props.Name || props.MpNombre || props.DeNombre || props.NOMAH || '';

        let rows = '';
        let nCampos = 0;
        for (const [k, v] of Object.entries(props)) {
          if (v === null || v === undefined || v === '') continue;
          if (k.toLowerCase() === 'id' || k.startsWith('SHAPE_') || k.startsWith('GLOBALID') || k === 'PK_CUE') continue;
          if (nCampos++ > 8) break;
          rows += `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`;
        }

        new maplibregl.Popup({ closeButton: true, offset: 12 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="pop">
              <h4>${tit || layerName}</h4>
              <div style="font-size:11px;color:var(--gris);margin-bottom:6px">${layerName}</div>
              <table>${rows}</table>
            </div>
          `)
          .addTo(map);
      });

      map.on('mousemove', (e) => {
        if (modoMedicion) {
          map.getCanvas().style.cursor = 'crosshair';
          if (tooltipEl) tooltipEl.hidden = true;
          return;
        }
        const visibleLayers = activeVectorLayerIds.filter((id) => {
          const l = map.getLayer(id);
          return l && map.getLayoutProperty(id, 'visibility') !== 'none' && !id.endsWith('__label');
        });
        if (!visibleLayers.length) {
          map.getCanvas().style.cursor = '';
          if (tooltipEl) tooltipEl.hidden = true;
          return;
        }
        const features = map.queryRenderedFeatures(e.point, { layers: visibleLayers });
        if (features && features.length > 0) {
          map.getCanvas().style.cursor = 'pointer';
          if (tooltipEl) {
            const p = features[0].properties || {};
            const tit = p.NOMBRE || p.Nombre || p.nombre || p.Name || p.MpNombre || p.DeNombre || p.NOMAH || p.UFP || '';
            if (tit) {
              tooltipEl.textContent = tit;
              tooltipEl.style.left = `${e.point.x}px`;
              tooltipEl.style.top = `${e.point.y}px`;
              tooltipEl.hidden = false;
            } else {
              tooltipEl.hidden = true;
            }
          }
        } else {
          map.getCanvas().style.cursor = '';
          if (tooltipEl) tooltipEl.hidden = true;
        }
      });

      map.on('mouseout', () => {
        if (tooltipEl) tooltipEl.hidden = true;
      });

      mapReady = true;
      return true;
    } catch (err) {
      console.warn('MapLibre WebGL context notice:', err);
      const mapaEl = document.getElementById('mapa');
      if (mapaEl) {
        mapaEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;color:#5b6875">
            <p style="font-size:16px;font-weight:600;margin-bottom:8px">Visualización WebGL</p>
            <p style="font-size:13px;max-width:500px">El mapa interactivo se activa en navegadores con aceleración WebGL estándar. Puede también consultar la lámina cartográfica de alta resolución.</p>
          </div>
        `;
      }
      mapReady = false;
      return false;
    }
  }

  // Cambio de mapa base raster
  function setBaseMap(type) {
    currentBase = type;
    document.querySelectorAll('#bases .base-card').forEach((card) => {
      card.classList.toggle('on', card.getAttribute('data-base') === type);
    });
    const rad = document.querySelector(`input[name="base"][value="${type}"]`);
    if (rad) rad.checked = true;
    if (!map || !mapReady) return;

    if (type === 'nada') {
      if (map.getLayer('base-layer')) {
        map.setLayoutProperty('base-layer', 'visibility', 'none');
      }
      return;
    }

    const conf = BASES[type];
    if (!conf) return;

    if (map.getLayer('base-layer')) map.removeLayer('base-layer');
    if (map.getSource('base-source')) map.removeSource('base-source');

    map.addSource('base-source', {
      type: 'raster',
      tiles: conf.tiles,
      tileSize: conf.tileSize,
      attribution: conf.attribution,
      maxzoom: conf.maxzoom
    });

    const layers = map.getStyle().layers || [];
    let beforeId = null;
    for (const l of layers) {
      if (l.id !== 'background' && l.id !== 'base-layer') {
        beforeId = l.id;
        break;
      }
    }

    map.addLayer(
      {
        id: 'base-layer',
        type: 'raster',
        source: 'base-source',
        paint: { 'raster-opacity': 1.0 }
      },
      beforeId
    );
  }

  // Carga de una vista cartográfica específica
  function loadVista(vistaId) {
    if (!VISTAS || !VISTAS[vistaId]) {
      console.warn('Vista no encontrada:', vistaId);
      return;
    }
    const vista = VISTAS[vistaId];
    currentVista = vista;

    // Renderizar panel de capas independientemente del estado de WebGL
    renderListaCapas(vista);

    // Omitidas
    const omitEl = document.getElementById('omitidas');
    if (omitEl) {
      if (vista.omitidas && vista.omitidas.length > 0) {
        omitEl.innerHTML = `
          <details class="omit">
            <summary>⚠️ ${vista.omitidas.length} capa(s) no cargadas</summary>
            <ul>
              ${vista.omitidas.map((o) => `<li><strong>${o.nombre}:</strong> ${o.motivo}</li>`).join('')}
            </ul>
          </details>
        `;
      } else {
        omitEl.innerHTML = '';
      }
    }

    if (!initMap() || !map) {
      return;
    }

    if (map.isStyleLoaded()) {
      applyVistaLayers(vista);
    } else {
      map.once('load', () => applyVistaLayers(vista));
    }
  }

  function ajustarEncuadreVista(vista, instant = false) {
    if (!map || !mapReady || !vista || !vista.bbox || vista.bbox.length !== 4) return;
    map.resize();
    const isPanelOpen = !document.getElementById('panel')?.classList.contains('cerrado');
    const isMobile = window.innerWidth <= 900;
    const containerW = map.getContainer()?.clientWidth || window.innerWidth;
    const rightPad = isMobile || !isPanelOpen ? 30 : Math.min(320, Math.floor(containerW * 0.30));

    const bounds = [
      [vista.bbox[0], vista.bbox[1]],
      [vista.bbox[2], vista.bbox[3]]
    ];
    map.fitBounds(bounds, {
      padding: { top: 40, bottom: 40, left: 40, right: rightPad },
      maxZoom: 16,
      duration: instant ? 0 : 550
    });
  }

  function applyVistaLayers(vista) {
    if (!map || !mapReady) return;

    // Limpiar rigurosamente todas las capas vectoriales y fuentes anteriores
    const style = map.getStyle();
    if (style && style.layers) {
      style.layers.forEach((l) => {
        if (l.id.startsWith('lyr_')) {
          if (map.getLayer(l.id)) map.removeLayer(l.id);
        }
      });
    }
    if (style && style.sources) {
      Object.keys(style.sources).forEach((srcId) => {
        if (srcId.startsWith('src_')) {
          if (map.getSource(srcId)) map.removeSource(srcId);
        }
      });
    }
    activeVectorLayerIds = [];
    activeVectorSourceIds = [];

    // Auto-zoom con encuadre inteligente y sincronizado
    ajustarEncuadreVista(vista);
    setTimeout(() => { if (map && mapReady) ajustarEncuadreVista(vista); }, 150);

    // Configurar mapa base predeterminado de la vista sólo si difiere del actual
    const baseOpt = vista.fondo || 'osm';
    const radio = document.querySelector(`input[name="base"][value="${baseOpt}"]`);
    if (radio) {
      radio.checked = true;
      if (currentBase !== baseOpt) {
        setBaseMap(baseOpt);
      }
    }

    // Registrar imágenes de patrones y marcadores requeridos
    vista.capas.forEach((c) => {
      if (c.estilo && c.estilo.ml) {
        c.estilo.ml.forEach((ml) => {
          if (ml.paint && ml.paint['fill-pattern']) {
            const patId = ml.paint['fill-pattern'];
            if (!map.hasImage(patId)) {
              map.addImage(patId, createPatternImage(patId));
            }
          }
          if (ml.layout && ml.layout['icon-image']) {
            const iconId = ml.layout['icon-image'];
            if (!map.hasImage(iconId)) {
              map.addImage(iconId, createMarkerImage(iconId));
            }
          }
        });
      }
    });

    // Agregar capas a MapLibre (de abajo hacia arriba para respetar el orden visual de QGIS)
    for (let i = vista.capas.length - 1; i >= 0; i--) {
      const capaObj = vista.capas[i];
      const layerIdx = i;
      capaObj._layerIds = [];
      const srcId = `src_${layerIdx}_${capaObj.capa}`;

      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: 'geojson',
          data: `data/capas/${capaObj.capa}.geojson`
        });
        activeVectorSourceIds.push(srcId);
      }

      if (capaObj.estilo && capaObj.estilo.ml) {
        capaObj.estilo.ml.forEach((ml, subIdx) => {
          const lyrId = `lyr_${layerIdx}_${capaObj.capa}_${subIdx}`;
          const lyrDef = {
            id: lyrId,
            type: ml.type,
            source: srcId,
            layout: Object.assign({}, ml.layout || {}),
            paint: Object.assign({}, ml.paint || {})
          };
          if (ml.filter) lyrDef.filter = ml.filter;
          if (capaObj.apagada) {
            lyrDef.layout.visibility = 'none';
          }
          if (map.getLayer(lyrId)) map.removeLayer(lyrId);
          map.addLayer(lyrDef);
          activeVectorLayerIds.push(lyrId);
          capaObj._layerIds.push(lyrId);
        });
      }

      if (capaObj.estilo && capaObj.estilo.etiqueta) {
        const etq = capaObj.estilo.etiqueta;
        const lblId = `lyr_${layerIdx}_${capaObj.capa}__label`;
        const lblDef = {
          id: lblId,
          type: 'symbol',
          source: srcId,
          layout: {
            'text-field': etq.texto,
            'text-size': etq.tam || 11,
            'text-offset': [0, 0.7],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'visibility': capaObj.apagada ? 'none' : 'visible'
          },
          paint: {
            'text-color': etq.color || '#2b2b2b',
            'text-halo-color': etq.halo || '#ffffff',
            'text-halo-width': 1.6
          }
        };
        if (map.getLayer(lblId)) map.removeLayer(lblId);
        map.addLayer(lblDef);
        activeVectorLayerIds.push(lblId);
        capaObj._layerIds.push(lblId);
      }
    }
  }

  function renderListaCapas(vista) {
    const cont = document.getElementById('listaCapas');
    if (!cont) return;
    cont.innerHTML = '';

    vista.capas.forEach((capaObj, idx) => {
      const capaEl = document.createElement('div');
      capaEl.className = `capa${capaObj.apagada ? ' off' : ''}`;
      capaEl.id = `ui_capa_${idx}_${capaObj.capa}`;

      const leyHtml = capaObj.estilo && capaObj.estilo.leyenda
        ? capaObj.estilo.leyenda
            .map((item) => `<div>${createLegendSvg(item.m)}<span title="${item.etq}">${item.etq}</span></div>`)
            .join('')
        : '';

      capaEl.innerHTML = `
        <div class="capa-tit">
          <input type="checkbox" id="chk_${idx}_${capaObj.capa}" ${capaObj.apagada ? '' : 'checked'}>
          <label for="chk_${idx}_${capaObj.capa}">${capaObj.nombre}</label>
          <button class="mini" title="Abrir tabla de atributos" data-tabla="${capaObj.capa}">☷</button>
        </div>
        <div class="ley">${leyHtml}</div>
        <div class="capa-ops">
          <span>Opacidad</span>
          <input type="range" min="0" max="100" value="100" data-op="${capaObj.capa}">
        </div>
      `;

      const chk = capaEl.querySelector(`input[type="checkbox"]`);
      chk.addEventListener('change', () => {
        const encendida = chk.checked;
        capaEl.classList.toggle('off', !encendida);
        if (map && mapReady && capaObj._layerIds) {
          capaObj._layerIds.forEach((id) => {
            if (map.getLayer(id)) {
              map.setLayoutProperty(id, 'visibility', encendida ? 'visible' : 'none');
            }
          });
        }
      });

      const opInput = capaEl.querySelector(`input[data-op]`);
      opInput.addEventListener('input', () => {
        const val = parseFloat(opInput.value) / 100;
        if (map && mapReady && capaObj._layerIds) {
          capaObj._layerIds.forEach((id) => {
            const l = map.getLayer(id);
            if (!l) return;
            if (l.type === 'fill') map.setPaintProperty(id, 'fill-opacity', val);
            else if (l.type === 'line') map.setPaintProperty(id, 'line-opacity', val);
            else if (l.type === 'circle') map.setPaintProperty(id, 'circle-opacity', val);
            else if (l.type === 'symbol') map.setPaintProperty(id, 'icon-opacity', val);
          });
        }
      });

      const btnTabla = capaEl.querySelector(`button[data-tabla]`);
      btnTabla.addEventListener('click', (ev) => {
        ev.stopPropagation();
        abrirCajonAtributos(capaObj);
      });

      cont.appendChild(capaEl);
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

    tit.textContent = capaObj.nombre;
    cajon.hidden = false;
    tablaCont.innerHTML = '<div style="padding:16px;color:var(--gris)">Cargando datos espaciales…</div>';
    filtro.value = '';

    let geojson = GEOJSON_CACHE.get(capaObj.capa);
    if (!geojson) {
      try {
        const resp = await fetch(`data/capas/${capaObj.capa}.geojson`);
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

  // --- MOTOR DE ESQUEMAS CONCEPTUALES INTERACTIVOS (DOCTORADO UPC) ---
  const ESQUEMAS_DATA = {
    'esq-1': {
      insignia: 'MARCO TEÓRICO · CAPÍTULO II',
      titulo: 'Genealogía paradigmática de la interfaz urbano-rural',
      subtitulo: 'Evolución histórica y epistemológica del concepto de interfaz: desde la visión dicotómica clásica hasta el enfoque hidro-logístico portuario contemporáneo.',
      nodos: [
        {
          id: 'p1',
          fase: '1900 – 1950',
          nombre: 'Enfoque Dicótomo / Dualista',
          desc: 'Frontera rígida y separación absoluta entre ciudad y campo.',
          color: '#64748b',
          icono: '🧱',
          autores: 'Von Thünen (1826), Park & Burgess (1925), Christaller (1933)',
          concepto: 'La ciudad y el campo se conciben como dos entidades cerradas, opuestas y mutuamente excluyentes. El borde es una línea divisoria física y administrativa sin espesor funcional ni gradación.',
          indicadores: [
            'Límites político-administrativos perimetrales cerrados',
            'Renta de la tierra con gradiente concéntrico decreciente clásico',
            'Inexistencia de dinámicas híbridas reconocidas normativamente'
          ],
          impacto: 'En Barranquilla histórica, este modelo se reflejó en la separación neta entre el casco fundacional y el suelo rústico de haciendas ganaderas antes del inicio del proceso de metropolización.',
          mapasRel: ['fig-2']
        },
        {
          id: 'p2',
          fase: '1950 – 1980',
          nombre: 'Enfoque Periurbano y Fringe Clásico',
          desc: 'Zona de transición, dispersión suburbana y especulación de rentas.',
          color: '#0284c7',
          icono: '🏘️',
          autores: 'Wehrwein (1942), Pryor (1968), Conzen (1960), Carter (1972)',
          concepto: 'Aparición del concepto de "Urban Fringe". Se reconoce la franja como una corona de fricción donde compiten el uso agrícola residual y la invasión de usos urbanos, caracterizada por discontinuidad morfológica y parcelaciones.',
          indicadores: [
            'Tasas aceleradas de cambio de cobertura vegetal a suelo sellado',
            'Aparición de parcelaciones residenciales y canteras periféricas',
            'Invasión progresiva a lo largo de vías radiales e infraestructura'
          ],
          impacto: 'Explicó el crecimiento desbordado hacia el suroccidente y sur del AMB (Soledad y Malambo) durante las décadas de industrialización y migración regional.',
          mapasRel: ['fig-3', 'atlas-3-5']
        },
        {
          id: 'p3',
          fase: '1980 – 2010',
          nombre: 'Enfoque Sistémico y Ecología del Paisaje',
          desc: 'Territorio híbrido, mosaico ecológico y flujos metabólicos.',
          color: '#059669',
          icono: '🌿',
          autores: 'Forman & Godron (1986), Allen (2003), Tacoli (1998), Sieverts (1997)',
          concepto: 'La interfaz deja de verse como borde residual para entenderse como un ecosistema híbrido dinámico ("Zwischenstadt" o ciudad intermedia) con intercambios bidireccionales de materia, energía, recursos hídricos y mano de obra.',
          indicadores: [
            'Fragmentación de hábitats y pérdida de corredores biológicos',
            'Servicios ecosistémicos de aprovisionamiento y regulación hídrica',
            'Movilidad pendular y mercados laborales periurbanos'
          ],
          impacto: 'Fundamental para comprender la extrema fragilidad de la Ciénaga de Mallorquín frente al avance constructivo del norte de Barranquilla y Puerto Colombia.',
          mapasRel: ['fig-4', 'atlas-3-9']
        },
        {
          id: 'p4',
          fase: '2010 – 2026',
          nombre: 'Interfaz Portuaria y Territorios Hidro-Logísticos',
          desc: 'Articulación global-local, nodos portuarios y gradientes del Sur Global.',
          color: '#d49a37',
          icono: '🚢',
          autores: 'Palmett (2026), Hoyle (1989), Ducruet (2006), Monios & Wilmsmeier (2012)',
          concepto: 'Aporte central de la tesis doctoral: en ciudades portuarias, la interfaz urbano-rural está tensionada por cadenas globales de suministro, frentes de agua fluvio-marítimos y plataformas logísticas supramunicipales que exigen ordenamiento funcional.',
          indicadores: [
            'Presión de bodegas, patios de contenedores y zonas francas sobre suelo rural',
            'Canal navegable del Río Magdalena y accesos marítimos',
            'Conflictos de zonificación entre autoridades portuarias (DIMAR) y ambientales (CRA)'
          ],
          impacto: 'Base del Modelo IOTF-IUR implementado para el Corredor Portuario, Vía 40 y la Circunvalar de la Prosperidad en el Área Metropolitana de Barranquilla.',
          mapasRel: ['fig-52', 'fig-56', 'fig-63']
        }
      ]
    },
    'esq-2': {
      insignia: 'DIMENSIONES ANALÍTICAS · CAPÍTULO II',
      titulo: 'Cuatro dimensiones constitutivas de la interfaz urbano-rural',
      subtitulo: 'Estructura analítica tetradimensional para diagnosticar, delimitar y ordenar operativamente las franjas de borde en ciudades portuarias.',
      nodos: [
        {
          id: 'd1',
          fase: 'Dimensión 1',
          nombre: 'Dimensión Biofísica y Ecosistémica',
          desc: 'Estructura ecológica principal, cuencas hídricas y vulnerabilidad ambiental.',
          color: '#059669',
          icono: '🌊',
          autores: 'Forman (1995), McHarg (1969), CRA Atlántico (2020)',
          concepto: 'Soporte natural del territorio que condiciona y debe orientar la ocupación humana. Integra cuerpos de agua lénticos y lóticos, coberturas vegetales nativas, geología, pendientes y áreas de amortiguamiento ambiental estuarino.',
          indicadores: [
            'Cuenca Ciénaga de Mallorquín y dinámica mareal estuarina',
            'Relictos de Bosque Seco Tropical (BST) y rondas hídricas de arroyos',
            'Conflictos de uso por sobreutilización y pérdida de permeabilidad del suelo'
          ],
          impacto: 'Permite delimitar las áreas no urbanizables de protección estricta en el borde norte costero y la ribera del Río Magdalena.',
          mapasRel: ['fig-4', 'atlas-3-9']
        },
        {
          id: 'd2',
          fase: 'Dimensión 2',
          nombre: 'Dimensión Morfológica y Espacial',
          desc: 'Forma urbana, gradientes de densidad, fragmentación y frentes de agua.',
          color: '#0284c7',
          icono: '📐',
          autores: 'Pryor (1968), Conzen (1960), Indovina (1990)',
          concepto: 'Patrones geométricos y físicos de ocupación del suelo. Mide la compacidad vs. dispersión (sprawl), la continuidad del parcelario y la conformación de frentes fluviales y marítimos bajo presión inmobiliaria.',
          indicadores: [
            'Huella urbana y evolución temporal de áreas selladas',
            'Tamaño medio y geometría de predios en suelo de expansión',
            'Efecto barrera de grandes infraestructuras viales metropolitanas'
          ],
          impacto: 'Revela la discontinuidad del borde entre Barranquilla y Puerto Colombia a lo largo del corredor universitario y la Vía al Mar.',
          mapasRel: ['fig-3', 'atlas-3-4', 'atlas-3-8']
        },
        {
          id: 'd3',
          fase: 'Dimensión 3',
          nombre: 'Dimensión Funcional, Productiva y Logística',
          desc: 'Actividades económicas, corredores intermodales y suelo logístico-industrial.',
          color: '#d49a37',
          icono: '🏭',
          autores: 'Hoyle (1989), Hesse (2008), Ducruet (2007)',
          concepto: 'Flujos de personas, mercancías y energía que articulan el borde metropolitano con el puerto y el hinterland regional. Capacidad de soporte para operaciones logísticas e intermodales de gran escala.',
          indicadores: [
            'Localización de zonas francas, bodegas y terminales de carga',
            'Capacidad y aforos vehiculares sobre la Circunvalar de la Prosperidad',
            'Aptitud agrológica del suelo según estudios del IGAC'
          ],
          impacto: 'Determina la delimitación de las UFP 1 (Unidades Logístico-Portuarias) en proximidad al canal navegable y autopistas troncales.',
          mapasRel: ['atlas-3-10', 'fig-52', 'comp-articulador']
        },
        {
          id: 'd4',
          fase: 'Dimensión 4',
          nombre: 'Dimensión Socio-Institucional y de Gobernanza',
          desc: 'Competencias jurisdiccionales, vacíos normativos y gobernanza metropolitana.',
          color: '#7c3aed',
          icono: '⚖️',
          autores: 'Allen (2003), Brenner (2004), AMB (2020)',
          concepto: 'Marco normativo, instrumentos de planificación (POT/PMOT) y capacidad institucional de coordinación supramunicipal frente a presiones inmobiliarias y descoordinación entre los municipios.',
          indicadores: [
            'Desfase normativo entre los POT de los 5 municipios metropolitanos',
            'Superposición de autoridades: AMB, CRA, DIMAR y Gobernación',
            'Vulnerabilidad social y acceso a equipamientos básicos en la periferia'
          ],
          impacto: 'Demuestra la urgencia de adoptar el Modelo IOTF-IUR como norma vinculante de superior jerarquía en el AMB.',
          mapasRel: ['fig-2', 'tabla-74', 'comp-normativo']
        }
      ]
    },
    'esq-3': {
      insignia: 'MODELO MORFOLÓGICO · CAPÍTULO II',
      titulo: 'Modelo estructural-funcional de Pryor adaptado al Sur Global',
      subtitulo: 'Reconfiguración del gradiente de borde periurbano para metrópolis portuarias latinoamericanas con alta polarización socio-espacial.',
      nodos: [
        {
          id: 'z1',
          fase: 'Zona 1',
          nombre: 'Núcleo Metropolitano Consolidado (Urban Core)',
          desc: 'Máxima densidad, servicios completos y actividades financieras.',
          color: '#0f172a',
          icono: '🏙️',
          autores: 'Pryor (1968), Adaptación Palmett (2026)',
          concepto: 'Centro de gravedad económico y residencial de la metrópoli. Presenta consolidación constructiva total, concentración de empleo terciario y acceso directo al puerto histórico.',
          indicadores: [
            'Densidades superiores a 120 hab/ha',
            'Cobertura de servicios públicos domiciliarios > 98%',
            'Suelo urbano consolidado sin vacíos de gran escala'
          ],
          impacto: 'Corresponde a las localidades Norte-Centro Histórico y Riomar de Barranquilla.',
          mapasRel: ['fig-2', 'atlas-3-4']
        },
        {
          id: 'z2',
          fase: 'Zona 2',
          nombre: 'Franja Urbana Interna (Inner Urban Fringe)',
          desc: 'Transición inmediata, renovación urbana y choque de densidades.',
          color: '#0284c7',
          icono: '🏗️',
          autores: 'Pryor (1968), Wehrwein (1942)',
          concepto: 'Espacio de contacto directo entre la ciudad consolidada y las zonas de crecimiento reciente. Coexisten procesos de densificación vertical con asentamientos populares consolidados.',
          indicadores: [
            'Suelo urbano no consolidado y áreas de cesión',
            'Cambios de uso de vivienda a comercio y talleres industriales',
            'Presión sobre corredores viales primarios'
          ],
          impacto: 'Franja de contacto en Soledad norte y borde de la Vía 40.',
          mapasRel: ['fig-3', 'atlas-3-8']
        },
        {
          id: 'z3',
          fase: 'Zona 3',
          nombre: 'Franja Urbana Externa (Outer Urban Fringe)',
          desc: 'Expansión formal, condominios campestres y plataformas de carga.',
          color: '#d49a37',
          icono: '🚛',
          autores: 'Pryor (1968), Follmann (2015)',
          concepto: 'Zona de mayor intensidad de transformación territorial. En ciudades portuarias, este sector aloja centros de distribución logística, zonas francas y urbanizaciones cerradas de estrato alto.',
          indicadores: [
            'Predios de gran extensión con licencias de parcelación',
            'Alta dependencia del vehículo particular y transporte pesado',
            'Transformación acelerada de fincas rústicas'
          ],
          impacto: 'Corredor Puerto Colombia - Galapa y eje de la Circunvalar de la Prosperidad.',
          mapasRel: ['fig-52', 'fig-62']
        },
        {
          id: 'z4',
          fase: 'Zona 4',
          nombre: 'Franja Rural Interna (Inner Rural Fringe)',
          desc: 'Agricultura residual, minería de materiales y asentamientos dispersos.',
          color: '#16a34a',
          icono: '🚜',
          autores: 'Pryor (1968), Bryant et al. (1982)',
          concepto: 'Predominio de usos agrícolas y pecuarios tradicionales, pero sometidos a alta incertidumbre por expectativas de especulación inmobiliaria y concesiones viales.',
          indicadores: [
            'Capacidad agrológica agredida por canteras de calizas y agregados',
            'Dispersión habitacional y déficit de saneamiento básico',
            'Supervivencia de economías campesinas locales'
          ],
          impacto: 'Sector rural de Galapa y Malambo interior.',
          mapasRel: ['atlas-3-10', 'fig-55']
        },
        {
          id: 'z5',
          fase: 'Zona 5',
          nombre: 'Matriz Rural Profunda (Hinterland Ecológico-Regional)',
          desc: 'Conservación ambiental, humedales y conectividad regional.',
          color: '#15803d',
          icono: '🌳',
          autores: 'Forman (1995), Palmett (2026)',
          concepto: 'Matriz biofísica que suministra servicios ecosistémicos de escala regional. Actúa como reservorio de biodiversidad y amortiguador climático ante eventos extremos.',
          indicadores: [
            'Complejo cenagoso y llanuras de inundación del Magdalena',
            'Suelo rural de protección forestal y recarga de acuíferos',
            'Mínima presión de impermeabilización'
          ],
          impacto: 'Ciénagas de Mallorquín, Bahía y zona sur del departamento del Atlántico.',
          mapasRel: ['fig-4', 'atlas-3-9']
        }
      ]
    },
    'esq-4': {
      insignia: 'DINÁMICAS DE TRANSFORMACIÓN · CAPÍTULO II',
      titulo: 'Tres vectores de periurbanización contemporánea (Follmann)',
      subtitulo: 'Fuerzas conductoras que moldean el territorio periférico en metrópolis del Sur Global según Alexander Follmann (2015).',
      nodos: [
        {
          id: 'v1',
          fase: 'Vector 1',
          nombre: 'Expansión Residencial Dual (Formal e Informal)',
          desc: 'Gated communities de élite frente a hábitats autoconstruidos populares.',
          color: '#0284c7',
          icono: '🏘️',
          autores: 'Follmann (2015), Borsdorf (2003), Sabatini (2001)',
          concepto: 'Polarización socioespacial aguda en el borde: condominios cerrados con áreas recreativas privadas y colegios coexisten contiguos a asentamientos sin títulos ni redes hidrosanitarias completas.',
          indicadores: [
            'Segregación espacial y barreras de control de acceso físico',
            'Precios del m² de suelo con brechas superiores al 800%',
            'Asentamientos en zonas de alto riesgo de inundación o remoción en masa'
          ],
          impacto: 'Contraste visible en Puerto Colombia (Altos de Pradomar / Sabanilla) frente a sectores vulnerables de Soledad y Malambo.',
          mapasRel: ['atlas-3-4', 'fig-53']
        },
        {
          id: 'v2',
          fase: 'Vector 2',
          nombre: 'Implantación Logística, Portuaria e Industrial',
          desc: 'Plataformas intermodales, bodegaje masivo y zonas francas.',
          color: '#d49a37',
          icono: '📦',
          autores: 'Follmann (2015), Hesse (2008), Cidell (2010)',
          concepto: 'Colonización del suelo rural plano y económico por infraestructuras de apoyo a la globalización. El borde periurbano se transforma en el corazón logístico de la región metropolitana.',
          indicadores: [
            'Hectáreas de suelo rústico convertidas a polígonos industriales',
            'Flujos continuos de transporte de carga pesada',
            'Dependencia directa de la conectividad fluvio-marítima y accesos portuarios'
          ],
          impacto: 'Concentración de parques empresariales sobre la Circunvalar de la Prosperidad y el Corredor Portuario de Barranquilla.',
          mapasRel: ['fig-52', 'fig-60', 'comp-articulador']
        },
        {
          id: 'v3',
          fase: 'Vector 3',
          nombre: 'Degradación Agraria y Presión Ecosistémica',
          desc: 'Pérdida de soberanía alimentaria, parcelaciones rústicas y erosión.',
          color: '#dc2626',
          icono: '📉',
          autores: 'Follmann (2015), Allen (2003), CRA (2020)',
          concepto: 'Asfixia progresiva de la producción campesina debido a la subida de avalúos, contaminación hídrica, venta de parcelas para ocio de fin de semana y extracción minera no regulada.',
          indicadores: [
            'Disminución del área cultivada en cultivos tradicionales de pancoger',
            'Sobreexplotación de canteras para materiales de construcción urbana',
            'Disrupción hidrológica de caños y ciénagas por rellenos ilegales'
          ],
          impacto: 'Deterioro de la capacidad agrológica documentado por el IGAC en los municipios metropolitanos.',
          mapasRel: ['atlas-3-9', 'atlas-3-10']
        }
      ]
    },
    'esq-5': {
      insignia: 'ARQUITECTURA DE LA INVESTIGACIÓN · CAPÍTULO I',
      titulo: 'Trazabilidad epistemológica y articulación metodológica',
      subtitulo: 'Ruta metodológica en cinco fases sucesivas desde la fundamentación teórica hasta la propuesta operativa de planificación territorial.',
      nodos: [
        {
          id: 'f1',
          fase: 'Fase I',
          nombre: 'Fundamentación Teórico-Epistemológica',
          desc: 'Revisión crítica de la literatura de franjas de interfaz en ciudades portuarias.',
          color: '#3b82f6',
          icono: '📚',
          autores: 'Capítulo I y II de la Tesis',
          concepto: 'Construcción del marco teórico interdisciplinario articulando el urbanismo, la ecología del paisaje, la geografía portuaria y el derecho territorial latinoamericano.',
          indicadores: [
            'Revisión sistemática de más de 200 fuentes bibliográficas internacionales',
            'Formulación de hipótesis y preguntas de investigación doctoral',
            'Definición del marco conceptual de 4 dimensiones constitutivas'
          ],
          impacto: 'Estableció las bases conceptuales para diferenciar la interfaz portuaria de un periurbano mediterráneo o interior tradicional.',
          mapasRel: ['esq-1', 'esq-2', 'esq-3']
        },
        {
          id: 'f2',
          fase: 'Fase II',
          nombre: 'Benchmarking y Análisis Comparado Internacional',
          desc: 'Estudio de 4 metrópolis portuarias: Barranquilla, Veracruz, Santos y Valparaíso.',
          color: '#0284c7',
          icono: '🌎',
          autores: 'Capítulo IV de la Tesis',
          concepto: 'Evaluación comparativa multivariable entre ciudades portuarias que combinan dinámicas fluviales y marítimas para identificar patrones comunes de tensión urbano-rural.',
          indicadores: [
            'Matriz comparativa de gobernanza portuaria y escala metropolitana',
            'Tráfico TEUs y longitud de interfaces logísticas',
            'Vulnerabilidad ambiental y modelos de expansión periurbana'
          ],
          impacto: 'Permitió validar que las patologías de borde observadas en Barranquilla responden a dinámicas estructurales de las ciudades puerto del continente.',
          mapasRel: ['fig-1', 'fig-40', 'fig-43', 'fig-46']
        },
        {
          id: 'f3',
          fase: 'Fase III',
          nombre: 'Diagnóstico Territorial Multidimensional del AMB',
          desc: 'Geoprocesamiento en QGIS, armonización de planes POT/PMOT y cruce agrológico IGAC/CRA.',
          color: '#10b981',
          icono: '🔬',
          autores: 'Capítulo III de la Tesis',
          concepto: 'Procesamiento espacial de más de 43 capas vectoriales del AMB para caracterizar la realidad empírica del borde a escala 1:10.000 y 1:25.000.',
          indicadores: [
            'Armonización de capas de uso del suelo de 5 municipios metropolitanos',
            'Evaluación agrológica semidetallada IGAC (Clases agrológicas IV a VII)',
            'Mapa de conflictos de uso del suelo CRA'
          ],
          impacto: 'Producción del Atlas Cartográfico de la Interfaz con 13 láminas de alta precisión espacial.',
          mapasRel: ['fig-3', 'fig-4', 'atlas-3-8', 'atlas-3-9', 'atlas-3-10']
        },
        {
          id: 'f4',
          fase: 'Fase IV',
          nombre: 'Modelo IOTF-IUR y Delimitación Funcional',
          desc: 'Formulación del Instrumento de Ordenamiento y delimitación de las UFP.',
          color: '#f59e0b',
          icono: '🧭',
          autores: 'Capítulo V de la Tesis',
          concepto: 'Superación del límite rígido mediante una delimitación funcional basada en variables continuas y zonificación operativa en Unidades Funcionales de Planificación (UFP 1 a 4).',
          indicadores: [
            'Algoritmo de delimitación funcional por gradientes territoriales',
            'Fichas técnicas normativas para UFP logísticas y residenciales',
            'Límites de amortiguamiento y protección ecosistémica'
          ],
          impacto: 'Entrega una cartografía propositiva lista para ser incorporada en la revisión del PMOT del AMB.',
          mapasRel: ['fig-52', 'fig-56', 'tabla-74']
        },
        {
          id: 'f5',
          fase: 'Fase V',
          nombre: 'Propuesta de Gobernanza e Instrumentos de Gestión',
          desc: 'Sistema multinodal, lineamientos de política pública y transferencia metodológica.',
          color: '#8b5cf6',
          icono: '🏛️',
          autores: 'Capítulo V y Conclusiones',
          concepto: 'Diseño institucional de una mesa permanente de gobernanza territorial y un modelo de articulación intermodal centrado en 4 nodos y un nuevo puerto interior.',
          indicadores: [
            'Matriz de competencias institucionales cruzadas',
            'Esquema multinodal sobre la Circunvalar de la Prosperidad',
            'Directrices para instrumentos de captura de plusvalías y compensación'
          ],
          impacto: 'Hoja de ruta concreta para que los tomadores de decisiones armonicen la expansión económica portuaria con la preservación ambiental.',
          mapasRel: ['fig-57', 'fig-61', 'fig-63']
        }
      ]
    },
    'esq-6-1': {
      insignia: 'SÍNTESIS DOCTORAL · CAPÍTULO V',
      titulo: 'Modelo Metodológico Integral IOTF-IUR',
      subtitulo: 'Instrumento de Ordenamiento Territorial Funcional para la Interfaz Urbano-Rural: el aporte troncal de la investigación doctoral.',
      nodos: [
        {
          id: 'c1',
          fase: 'Pilar A',
          nombre: 'Delimitación Funcional y Criterios Multiescalares',
          desc: 'Definición operativa de la franja superando límites político-administrativos.',
          color: '#0284c7',
          icono: '📐',
          autores: 'Aida Palmett (2026), Tesis Doctoral UPC',
          concepto: 'Reemplaza el perímetro urbano estático por una franja de espesor variable definida mediante la superposición multicriterio de discontinuidades morfológicas, cuencas hídricas y áreas de influencia vial.',
          indicadores: [
            'Polígono funcional de la interfaz metropolitana del AMB',
            'Buffer de conectividad multimodal sobre vías 4G',
            'Envolvente de amortiguamiento del ecosistema de Mallorquín'
          ],
          impacto: 'Establece con precisión milimétrica la geografía de intervención del instrumento.',
          mapasRel: ['fig-3', 'fig-65', 'tabla-74']
        },
        {
          id: 'c2',
          fase: 'Pilar B',
          nombre: 'Zonificación en Unidades Funcionales (UFPs 1 al 4)',
          desc: 'Régimen de usos compatibles, condicionados y prohibidos.',
          color: '#d49a37',
          icono: '📑',
          autores: 'Aida Palmett (2026)',
          concepto: 'Cuatro categorías operativas que traducen el diagnóstico en reglas claras de aprovechamiento: UFP 1 (Logístico-Portuaria), UFP 2 (Residencial de Expansión), UFP 3 (Transición Ambiental) y UFP 4 (Protección Ecosistémica).',
          indicadores: [
            'Índices de ocupación y construcción diferenciados',
            'Compatibilidad con la capacidad agrológica del suelo (IGAC)',
            'Obligación de cesiones para corredores de conectividad verde'
          ],
          impacto: 'Resuelve el caos de incompatibilidad entre industrias pesadas y viviendas periurbanas.',
          mapasRel: ['fig-52', 'fig-56', 'comp-normativo']
        },
        {
          id: 'c3',
          fase: 'Pilar C',
          nombre: 'Sistema Multinodal y Corredores de Integración',
          desc: '4 Nodos estratégicos integrados por la Circunvalar y el Nuevo Puerto Interior.',
          color: '#059669',
          icono: '⚡',
          autores: 'Aida Palmett (2026)',
          concepto: 'Estructura reticular que descentraliza las actividades del núcleo metropolitano conectando nodos especializados: Nodo 1 (Ecoturístico), Nodo 2 (Agroindustrial), Nodo 3 (Cultural) y Nodo 4 (Industrial-Aeronáutico).',
          indicadores: [
            'Localización del Nuevo Puerto Interior sobre el eje platanal',
            'Capacidad de intercambio modal de carga y pasajeros',
            'Reducción de congestión vehicular en el casco central de Barranquilla'
          ],
          impacto: 'Convierte la Circunvalar de la Prosperidad en el eje vertebrador del futuro metropolitano.',
          mapasRel: ['fig-57', 'fig-58', 'fig-59', 'fig-60', 'fig-61', 'fig-62', 'fig-63']
        },
        {
          id: 'c4',
          fase: 'Pilar D',
          nombre: 'Gobernanza Supramunicipal y Monitoreo Territorial',
          desc: 'Mecanismo institucional vinculante para los 5 municipios y entes de control.',
          color: '#7c3aed',
          icono: '🏛️',
          autores: 'Aida Palmett (2026)',
          concepto: 'Estructura de gestión participativa y técnica liderada por el AMB, con participación de la CRA, DIMAR y secretarías de planeación para asegurar la aplicación estricta del modelo.',
          indicadores: [
            'Mesa Técnica Permanente de la Interfaz Portuaria',
            'Geovisor GeoInterfaz como Observatorio Territorial Abierto',
            'Banco metropolitano de suelo e instrumentos de captura de plusvalías'
          ],
          impacto: 'Garantiza la sostenibilidad y permanencia de las directrices de la tesis a largo plazo.',
          mapasRel: ['tabla-74', 'comp-normativo']
        }
      ]
    }
  };

  function renderEsquemaInteractivo(item) {
    const visEsquema = document.getElementById('visEsquema');
    if (!visEsquema) return;

    const data = ESQUEMAS_DATA[item.id] || {
      insignia: 'ESQUEMA CONCEPTUAL · TESIS DOCTORAL',
      titulo: item.titulo,
      subtitulo: item.nota || 'Esquema metodológico de la investigación doctoral.',
      nodos: []
    };

    let nodosHtml = '';
    (data.nodos || []).forEach((nodo, idx) => {
      nodosHtml += `
        <div class="esq-nodo-card ${idx === 0 ? 'activo' : ''}" data-idx="${idx}" style="--c-nodo:${nodo.color}">
          <div class="esq-nodo-icono">${nodo.icono || '📌'}</div>
          <div class="esq-nodo-info">
            <span class="esq-nodo-fase">${nodo.fase || 'FASE'}</span>
            <h4>${nodo.nombre}</h4>
            <p>${nodo.desc || ''}</p>
          </div>
          <div class="esq-nodo-flecha">→</div>
        </div>
      `;
    });

    visEsquema.innerHTML = `
      <div class="esq-contenedor">
        <div class="esq-cabecera">
          <div class="esq-insignia">✨ ${data.insignia}</div>
          <h2>${item.etiqueta}: ${data.titulo}</h2>
          <p>${data.subtitulo}</p>
        </div>
        <div class="esq-layout">
          <div class="esq-nodos-col">
            <div class="esq-instruccion">🔍 Seleccione o pase el mouse sobre un componente para explorar su fundamentación:</div>
            <div class="esq-nodos-lista" id="esqNodosLista">
              ${nodosHtml}
            </div>
          </div>
          <div class="esq-detalle-col" id="esqDetalleCol"></div>
        </div>
      </div>
    `;

    function actualizarDetalle(idx) {
      const nodo = (data.nodos || [])[idx];
      if (!nodo) return;

      const detCol = document.getElementById('esqDetalleCol');
      if (!detCol) return;

      const indHtml = (nodo.indicadores || [])
        .map((ind) => `<li><strong>•</strong> ${ind}</li>`)
        .join('');

      let ctaHtml = '';
      if (nodo.mapasRel && nodo.mapasRel.length) {
        ctaHtml = nodo.mapasRel
          .map((mid) => {
            const m = ITEMS_MAP.get(mid);
            if (!m) return '';
            return `<a href="#/${m.id}" class="btn chico" style="text-decoration:none">🗺️ Ver ${m.etiqueta}: ${m.titulo.substring(0, 30)}…</a>`;
          })
          .filter(Boolean)
          .join('');
      }

      const hasImagen = Boolean((item.lamina && item.lamina.src) || (item.imagenes && item.imagenes.length));
      if (hasImagen) {
        ctaHtml += `<button class="btn chico" id="btnEsqVerImagen" title="Ver lámina/gráfico original de alta definición">🖼️ Gráfico original</button>`;
      }

      detCol.innerHTML = `
        <div class="esq-det-cab">
          <div class="esq-det-ico" style="background:${nodo.color}18;color:${nodo.color}">${nodo.icono || '📌'}</div>
          <div class="esq-det-tit-wrap">
            <span style="font-size:11px;font-weight:700;color:${nodo.color};letter-spacing:.05em">${nodo.fase}</span>
            <h3>${nodo.nombre}</h3>
            ${nodo.autores ? `<div class="esq-det-autores"><strong>Referencia:</strong> ${nodo.autores}</div>` : ''}
          </div>
        </div>

        <div class="esq-det-sec-tit">Definición conceptual y marco doctoral</div>
        <div class="esq-det-concepto">${nodo.concepto}</div>

        ${nodo.indicadores && nodo.indicadores.length ? `
          <div class="esq-det-sec-tit">Variables e indicadores analizados</div>
          <ul class="esq-det-ind-lista">${indHtml}</ul>
        ` : ''}

        ${nodo.impacto ? `
          <div class="esq-det-impacto">
            <strong>Impacto en el AMB / Ciudades Portuarias:</strong><br>
            ${nodo.impacto}
          </div>
        ` : ''}

        ${ctaHtml ? `<div class="esq-det-cta">${ctaHtml}</div>` : ''}
      `;

      document.getElementById('btnEsqVerImagen')?.addEventListener('click', () => {
        switchLienzoView('imagen');
      });
    }

    // Inicializar primer nodo
    actualizarDetalle(0);

    const cards = visEsquema.querySelectorAll('.esq-nodo-card');
    cards.forEach((card) => {
      const idx = parseInt(card.getAttribute('data-idx'), 10);
      const activar = () => {
        cards.forEach((c) => c.classList.remove('activo'));
        card.classList.add('activo');
        actualizarDetalle(idx);
      };
      card.addEventListener('mouseenter', activar);
      card.addEventListener('click', activar);
    });
  }

  // --- CAMBIO DE VISTA DEL LIENZO (MAPA / LÁMINA / DOCUMENTO / ESQUEMA) ---
  function switchLienzoView(mode) {
    const visMapa = document.getElementById('visMapa');
    const visImagen = document.getElementById('visImagen');
    const visDoc = document.getElementById('visDoc');
    const visEsquema = document.getElementById('visEsquema');
    const segButtons = document.querySelectorAll('#cabecera .seg button');

    visMapa.hidden = mode !== 'mapa';
    visImagen.hidden = mode !== 'imagen';
    visDoc.hidden = mode !== 'doc';
    if (visEsquema) visEsquema.hidden = mode !== 'esquema';

    segButtons.forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-v') === mode);
    });

    if (mode === 'mapa' && map && mapReady) {
      setTimeout(() => {
        map.resize();
        if (currentVista) ajustarEncuadreVista(currentVista);
      }, 60);
      setTimeout(() => {
        map.resize();
        if (currentVista) ajustarEncuadreVista(currentVista);
      }, 200);
    } else if (mode === 'imagen' && window.fitImageZoomer) {
      setTimeout(() => window.fitImageZoomer(), 60);
    }
  }

  // --- RENDERIZADO DEL DETALLE DE UN ELEMENTO (#pgElemento) ---
  async function showElement(id) {
    const item = ITEMS_MAP.get(id);
    if (!item) {
      console.warn('Elemento no encontrado en catálogo:', id);
      navigate('#/');
      return;
    }
    currentItem = item;

    // Activar inmediatamente la página del elemento
    showPage('pgElemento');
    document.title = `${item.etiqueta}: ${item.titulo} · Geovisor Tesis`;

    // Resaltar en el árbol
    document.querySelectorAll('#arbol .it').forEach((el) => {
      el.classList.toggle('on', el.getAttribute('data-id') === id);
    });

    // Desplegar el <details> del capítulo correspondiente
    const activeLink = document.querySelector(`#arbol .it[data-id="${id}"]`);
    if (activeLink) {
      const cap = activeLink.closest('details.cap');
      if (cap) cap.open = true;
      activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Cabecera del elemento
    const cab = document.getElementById('cabecera');
    const migaTxt = item.ruta && item.ruta.length ? item.ruta.join(' › ') : 'Tesis doctoral';

    // Determinar vistas disponibles para el conmutador segmentado (.seg)
    const isEsquema = item.clase === 'esquema' || item.tipo === 'esquema' || Boolean(ESQUEMAS_DATA[item.id]);
    const hasMapa = Boolean(item.vista);
    const hasLamina = Boolean(item.lamina && item.lamina.src);
    const hasFiguraImg = Boolean(item.imagenes && item.imagenes.length);
    const hasImagen = hasLamina || hasFiguraImg;
    const hasDoc = Boolean(item.tabla || hasFiguraImg);

    let segHtml = '';
    if (isEsquema) {
      segHtml = `
        <div class="seg" role="group" aria-label="Cambiar vista">
          <button data-v="esquema" class="on">🧠 Esquema conceptual interactivo</button>
          ${hasImagen ? `<button data-v="imagen">🖼️ Gráfico original (Alta resolución)</button>` : ''}
        </div>
      `;
    } else if (hasMapa && hasImagen) {
      segHtml = `
        <div class="seg" role="group" aria-label="Cambiar vista">
          <button data-v="mapa" class="on">🗺️ Mapa interactivo</button>
          <button data-v="imagen">${hasLamina ? '🖼️ Lámina de atlas' : '🖼️ Gráfico de figura'}</button>
        </div>
      `;
    } else if (hasMapa && item.clase === 'tabla') {
      segHtml = `
        <div class="seg" role="group" aria-label="Cambiar vista">
          <button data-v="mapa" class="on">🗺️ Mapa asociado</button>
          <button data-v="doc">📊 Tabla de tesis</button>
        </div>
      `;
    } else if (hasDoc && hasLamina) {
      segHtml = `
        <div class="seg" role="group" aria-label="Cambiar vista">
          <button data-v="imagen" class="on">🖼️ Lámina alta resolución</button>
          <button data-v="doc">📄 Documento</button>
        </div>
      `;
    }

    let relBtn = '';
    if (item.rel) {
      const relItem = ITEMS_MAP.get(item.rel);
      if (relItem) {
        relBtn = `<a href="#/${relItem.id}" class="btn chico" title="Ver elemento complementario">🔗 Ver ${relItem.etiqueta}</a>`;
      }
    }

    let notaHtml = '';
    if (item.nota) {
      const esLarga = item.nota.length > 220;
      notaHtml = `
        <div class="nota${esLarga ? ' corta' : ''}" id="notaTxt">
          ${item.nota}
        </div>
        ${esLarga ? '<button class="mas" id="btnMasNota">Ver nota completa ▾</button>' : ''}
      `;
    }

    cab.innerHTML = `
      <div class="miga">${migaTxt}</div>
      <div class="fila">
        <h1><span class="eti">${item.etiqueta}:</span> ${item.titulo}</h1>
        <div class="acciones">
          ${segHtml}
          ${hasMapa ? '<button class="btn chico" id="btnAjustarEncuadre" title="Restablecer encuadre y zoom original de la investigación">🎯 Encuadre original</button>' : ''}
          ${relBtn}
          <button class="btn pri" id="btnCompartir">📤 Compartir / Citar</button>
        </div>
      </div>
      ${notaHtml}
    `;

    document.getElementById('btnAjustarEncuadre')?.addEventListener('click', () => {
      if (currentVista) ajustarEncuadreVista(currentVista);
    });
    document.getElementById('btnCompartir')?.addEventListener('click', () => openShareDialog(item));

    const btnMasNota = document.getElementById('btnMasNota');
    if (btnMasNota) {
      btnMasNota.addEventListener('click', () => {
        const notaBox = document.getElementById('notaTxt');
        if (notaBox.classList.contains('corta')) {
          notaBox.classList.remove('corta');
          btnMasNota.textContent = 'Ver menos ▴';
        } else {
          notaBox.classList.add('corta');
          btnMasNota.textContent = 'Ver nota completa ▾';
        }
      });
    }

    cab.querySelectorAll('.seg button').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchLienzoView(btn.getAttribute('data-v'));
      });
    });

    // Activar lienzo inicial según el tipo de elemento
    const zoomImg = document.getElementById('zoomImg');
    const visDoc = document.getElementById('visDoc');

    if (isEsquema) {
      switchLienzoView('esquema');
      renderEsquemaInteractivo(item);
      if (zoomImg && (hasLamina || hasFiguraImg)) {
        zoomImg.src = `data/${hasLamina ? item.lamina.src : item.imagenes[0].src}`;
        zoomImg.alt = item.titulo;
      }
    } else if (hasMapa) {
      switchLienzoView('mapa');
      loadVista(item.vista);
      if (zoomImg) {
        if (hasLamina) {
          zoomImg.src = `data/${item.lamina.src}`;
          zoomImg.alt = item.titulo;
        } else if (hasFiguraImg) {
          zoomImg.src = `data/${item.imagenes[0].src}`;
          zoomImg.alt = item.titulo;
        }
      }
    } else if (hasImagen) {
      switchLienzoView('imagen');
      if (hasLamina) {
        zoomImg.src = `data/${item.lamina.src}`;
        zoomImg.alt = item.titulo;
      } else if (hasFiguraImg) {
        zoomImg.src = `data/${item.imagenes[0].src}`;
        zoomImg.alt = item.titulo;
      }
    } else {
      switchLienzoView('doc');
    }

    // Contenido del visor de documentos (#visDoc) para tablas o figuras
    if (item.clase === 'tabla' && item.tabla) {
      try {
        const resp = await fetch(`data/${item.tabla}`);
        const tblHtml = await resp.text();
        visDoc.innerHTML = `
          <div class="hoja tesis-tabla">
            <h2>${item.etiqueta} · Manuscrito de tesis</h2>
            <div class="envoltura">${tblHtml}</div>
          </div>
        `;
      } catch (_) {
        visDoc.innerHTML = `<div class="hoja"><p>No se pudo cargar la tabla ${item.tabla}</p></div>`;
      }
    } else if (hasFiguraImg && !isEsquema) {
      visDoc.innerHTML = `
        <div class="hoja" style="text-align:center">
          <h2>${item.etiqueta} · Gráfico extraído del manuscrito</h2>
          <img class="fig-img" src="data/${item.imagenes[0].src}" alt="${item.titulo}">
        </div>
      `;
    }
  }

  // Diccionario de temas para clasificación de las salidas cartográficas
  const MAPAS_TEMAS = {
    'fig-1': ['borde', 'comparativo'],
    'fig-2': ['borde'],
    'fig-3': ['borde'],
    'esq-2': ['teorico', 'borde'],
    'esq-3': ['teorico', 'borde'],
    'fig-3b': ['borde'],
    'fig-4': ['ecologico', 'borde'],
    'fig-6': ['borde', 'nodos'],
    'atlas-3-4': ['usos', 'borde'],
    'atlas-3-5': ['borde', 'usos'],
    'atlas-3-6': ['nodos', 'usos'],
    'atlas-3-7': ['nodos'],
    'atlas-3-8': ['usos'],
    'atlas-3-9': ['usos', 'ecologico'],
    'atlas-3-10': ['usos', 'ufp'],
    'atlas-3-11': ['nodos'],
    'atlas-3-12': ['borde'],
    'atlas-3-13': ['borde', 'ufp'],
    'fig-40': ['comparativo', 'borde'],
    'fig-41': ['comparativo', 'nodos'],
    'fig-42': ['comparativo', 'ecologico'],
    'fig-43': ['comparativo', 'borde'],
    'fig-44': ['comparativo', 'ecologico'],
    'fig-45': ['comparativo', 'borde'],
    'fig-46': ['comparativo', 'borde'],
    'fig-47': ['comparativo', 'ecologico'],
    'fig-48': ['comparativo', 'ecologico'],
    'fig-52': ['ufp', 'nodos'],
    'fig-53': ['ufp'],
    'fig-54': ['ufp'],
    'fig-55': ['ufp'],
    'fig-56': ['ufp', 'usos'],
    'fig-57': ['nodos', 'ecologico'],
    'fig-58': ['nodos', 'usos'],
    'fig-59': ['nodos'],
    'fig-60': ['nodos', 'usos'],
    'fig-61': ['nodos'],
    'fig-62': ['nodos'],
    'fig-63': ['nodos', 'ufp'],
    'fig-65': ['borde', 'ufp'],
    'tabla-74': ['ufp', 'borde', 'usos'],
    'comp-articulador': ['nodos', 'ufp'],
    'comp-normativo': ['usos', 'ufp']
  };

  // --- PÁGINA: INICIO (#pgInicio) ---
  function renderInicio() {
    const pg = document.getElementById('pgInicio');
    if (!pg || pg.children.length > 0) return;

    const meta = CATALOGO.meta || {};
    const nMapas = CATALOGO.items.filter((i) => i.tipo === 'mapa').length;
    const nLaminas = CATALOGO.items.filter((i) => i.lamina).length;
    const nFiguras = CATALOGO.items.filter((i) => i.clase === 'figura' && i.tipo !== 'mapa').length;
    const nTablas = CATALOGO.items.filter((i) => i.clase === 'tabla').length;
    const nEsquemas = CATALOGO.items.filter((i) => i.clase === 'esquema').length;
    const nCapas = Object.keys(CAPAS || {}).length;

    // Catálogo completo de salidas cartográficas y mapas interactivos (43 mapas)
    const todosMapas = (CATALOGO.items || []).filter((i) => i.tipo === 'mapa' || i.vista);

    const cardsHtml = todosMapas
      .map((it) => {
        const imgUrl = it.mini
          ? `data/${it.mini}`
          : it.lamina
          ? `data/${it.lamina.src}`
          : it.imagenes && it.imagenes.length
          ? `data/${it.imagenes[0].src}`
          : 'logo_aida.svg';
        const nCapasVista = VISTAS && VISTAS[it.vista] && VISTAS[it.vista].capas ? VISTAS[it.vista].capas.length : 0;
        const temasArr = MAPAS_TEMAS[it.id] || ['borde'];
        const capNum =
          it.capitulo === 's1'
            ? 'Cap. I'
            : it.capitulo === 's22'
            ? 'Cap. II'
            : it.capitulo === 's48'
            ? 'Cap. III'
            : it.capitulo === 's130'
            ? 'Cap. IV'
            : it.capitulo === 's177'
            ? 'Cap. V'
            : 'Tesis';

        const temasEtiquetas = temasArr
          .map((t) => {
            if (t === 'borde') return 'Borde';
            if (t === 'usos') return 'Usos';
            if (t === 'ecologico') return 'Ecosistémico';
            if (t === 'nodos') return 'Nodos';
            if (t === 'ufp') return 'UFP';
            if (t === 'comparativo') return 'Internacional';
            return 'Teórico';
          })
          .join(' · ');

        return `
        <article class="g-card" data-cap="${it.capitulo}" data-temas="${temasArr.join(',')}" data-id="${it.id}">
          <a class="g-card-link" href="#/${it.id}">
            <div class="g-card-img" style="background-image:url('${imgUrl}')">
              <span class="g-card-badge">${capNum}</span>
              ${
                nCapasVista > 0
                  ? `<span class="g-card-layers">🗺️ ${nCapasVista} capas SIG</span>`
                  : it.lamina
                  ? `<span class="g-card-layers">🖼️ Atlas HD</span>`
                  : `<span class="g-card-layers">📐 Gráfico</span>`
              }
            </div>
            <div class="g-card-cuerpo">
              <span class="g-card-eti">${it.etiqueta}</span>
              <h4 class="g-card-tit" title="${it.titulo}">${it.titulo}</h4>
              <div class="g-card-meta">
                <span>${temasEtiquetas}</span>
                <span class="g-card-btn">Ver interactivo →</span>
              </div>
            </div>
          </a>
        </article>
      `;
      })
      .join('');

    pg.innerHTML = `
      <div class="hero">
        <div class="sup">${meta.universidad} · ${meta.programa}</div>
        <h1>${meta.titulo}</h1>
        <div class="sub">${meta.subtitulo}</div>
        <div class="quien">
          <strong>Doctoranda:</strong> ${meta.autora}<br>
          <strong>Dirección de tesis:</strong> ${meta.directores}<br>
          <strong>Año académico:</strong> ${meta.anio}
        </div>
        <div class="cifras">
          <a class="cifra" href="#/" data-filtro="mapa"><b>${nMapas}</b><span>Mapas interactivos</span></a>
          <a class="cifra" href="#/" data-filtro="mapa"><b>${nLaminas}</b><span>Láminas de Atlas</span></a>
          <a class="cifra" href="#/" data-filtro="grafico"><b>${nFiguras}</b><span>Figuras</span></a>
          <a class="cifra" href="#/" data-filtro="tabla"><b>${nTablas}</b><span>Tablas</span></a>
          <a class="cifra" href="#/" data-filtro="esquema"><b>${nEsquemas}</b><span>Esquemas</span></a>
          <a class="cifra" href="#/datos"><b>${nCapas}</b><span>Capas SIG</span></a>
        </div>
      </div>

      <div class="instituciones-franja">
        <div class="inst-franja-texto">
          <strong>🏛️ Marco Institucional y Avales de Investigación Doctoral</strong>
          <span>Doctorado en Sostenibilidad UPC (Barcelona) · Cooperación académica con Universidad del Atlántico, AMB, IGAC, CRA y DIMAR.</span>
        </div>
        <button class="btn chico" id="btnVerInstitucionesHero">Ver entidades y avales ▾</button>
      </div>

      <div class="inicio-cuerpo">
        <div class="como">
          <strong>💡 Plataforma cartográfica para la evaluación doctoral:</strong>
          Cada mapa, lámina del atlas, tabla y esquema conceptual cuenta con un identificador único y permalink propio (ej: <code>#/fig-3</code>, <code>#/atlas-3-8</code>, <code>#/fig-52</code>).
          En el botón <em>Compartir / Citar</em> de cada vista obtendrá el enlace directo y el código QR oficial para anexar en la nota de cada mapa de su manuscrito, permitiendo a los directores y jurados evaluar las capas, simbología de QGIS y atributos espaciales en vivo.
        </div>

        <section class="galeria-seccion">
          <div class="galeria-cab">
            <div>
              <h2>Cartografía y salidas destacadas de la investigación</h2>
              <p>Selección sistemática clasificada de los Capítulos I al V (${todosMapas.length} mapas interactivos)</p>
            </div>
            <div class="galeria-stats">
              <div class="g-stat" id="galeriaContador">Mostrando <strong>${todosMapas.length}</strong> de ${todosMapas.length} mapas</div>
            </div>
          </div>

          <!-- Filtro por Capítulo -->
          <div class="galeria-pills-cap" id="filtroCaps">
            <span class="g-cap-lbl">Capítulo:</span>
            <button class="g-cap-btn on" data-cap="todos">Todos (${todosMapas.length})</button>
            <button class="g-cap-btn" data-cap="s1">Cap. I: Problema (3)</button>
            <button class="g-cap-btn" data-cap="s22">Cap. II: Marco Teórico (2)</button>
            <button class="g-cap-btn" data-cap="s48">Cap. III: Barranquilla - AMB (13)</button>
            <button class="g-cap-btn" data-cap="s130">Cap. IV: Comparativo Int. (9)</button>
            <button class="g-cap-btn" data-cap="s177">Cap. V: Modelo IOTF-IUR (16)</button>
          </div>

          <!-- Filtro por Eje Temático -->
          <div class="galeria-pills-tema" id="filtroTemas">
            <span class="g-tema-lbl">Eje temático:</span>
            <button class="g-tema-btn on" data-tema="todos">Todos los temas</button>
            <button class="g-tema-btn" data-tema="borde">🌐 Borde y Delimitación</button>
            <button class="g-tema-btn" data-tema="usos">📐 Usos del Suelo y Normativa</button>
            <button class="g-tema-btn" data-tema="ecologico">🌿 Estructura Ecosistémica</button>
            <button class="g-tema-btn" data-tema="nodos">⚡ Nodos y Corredores</button>
            <button class="g-tema-btn" data-tema="ufp">🏛️ Unidades UFP</button>
            <button class="g-tema-btn" data-tema="comparativo">🚢 Comparativo Internacional</button>
          </div>

          <!-- Grilla de mapas -->
          <div class="galeria-grid" id="galeriaGrid">
            ${cardsHtml}
          </div>
        </section>
      </div>
    `;

    // Filtros interactivos de la galería
    let capFiltro = 'todos';
    let temaFiltro = 'todos';

    function actualizarFiltros() {
      const cards = pg.querySelectorAll('.g-card');
      let visibles = 0;
      cards.forEach((c) => {
        const cCap = c.getAttribute('data-cap');
        const cTemas = (c.getAttribute('data-temas') || '').split(',');
        const matchCap = capFiltro === 'todos' || cCap === capFiltro;
        const matchTema = temaFiltro === 'todos' || cTemas.includes(temaFiltro);
        if (matchCap && matchTema) {
          c.hidden = false;
          visibles++;
        } else {
          c.hidden = true;
        }
      });
      const cnt = document.getElementById('galeriaContador');
      if (cnt) cnt.innerHTML = `Mostrando <strong>${visibles}</strong> de ${todosMapas.length} mapas`;
    }

    pg.querySelectorAll('#filtroCaps .g-cap-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pg.querySelectorAll('#filtroCaps .g-cap-btn').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        capFiltro = btn.getAttribute('data-cap');
        actualizarFiltros();
      });
    });

    pg.querySelectorAll('#filtroTemas .g-tema-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pg.querySelectorAll('#filtroTemas .g-tema-btn').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        temaFiltro = btn.getAttribute('data-tema');
        actualizarFiltros();
      });
    });

    document.getElementById('btnVerInstitucionesHero')?.addEventListener('click', () => {
      document.getElementById('dlgInstituciones')?.showModal();
    });

    pg.querySelectorAll('a.cifra[data-filtro]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const f = a.getAttribute('data-filtro');
        const chip = document.querySelector(`#chips button[data-f="${f}"]`);
        if (chip) chip.click();
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
          .map((v) => `<a class="tag" href="#/datos" data-vid="${v}">${v}</a>`)
          .join('');

        const camposHtml = (c.campos || [])
          .map((f) => `<div><b>${f.n}</b> <span>(${f.t})</span></div>`)
          .join('');

        return `
          <tr data-c="${c.id}" data-txt="${(c.nombre + ' ' + c.geom + ' ' + (c.fuente || '')).toLowerCase()}">
            <td><strong>${c.nombre}</strong><br><small class="ruta">${c.archivo}</small></td>
            <td><span class="tag">${c.geom}</span></td>
            <td class="num">${c.n ? c.n.toLocaleString('es-CO') : '—'}</td>
            <td>${c.crs || '—'}</td>
            <td><small>${c.fuente || 'SIG Tesis'}</small></td>
            <td><span class="tag" style="background:#eef2f6;color:var(--gris)">🔒 Solo lectura</span></td>
          </tr>
          <tr class="det" id="det_${c.id}" hidden>
            <td colspan="6">
              <div style="font-size:11.5px;color:var(--gris);margin-bottom:6px"><strong>Campos de la capa (${c.campos ? c.campos.length : 0}):</strong></div>
              <div class="campos">${camposHtml || '<i>Sin campos definidos</i>'}</div>
              <div style="margin-top:8px"><strong>Vistas que la utilizan:</strong> ${vistasTags || '<i>Ninguna asignada</i>'}</div>
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
          <summary>📁 <strong>${r.n}</strong> — <i>${r.desc}</i> <span>(${r.archivos} archivos · ${r.mb} MB)</span></summary>
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
        <h1>Catálogo de capas espaciales y datos de la investigación</h1>
        <p class="lead">
          Inventario técnico de las ${nCapas} capas vectoriales extraídas directamente desde los proyectos QGIS del Sistema de Información Geográfica (SIG). Todas las geometrías fueron estandarizadas a EPSG:4326 (WGS84) para despliegue web, preservando su proyección cartográfica de origen (MAGNA-SIRGAS 2018 / Origen Nacional EPSG:9377 y zonas Gauss-Krüger).
        </p>

        <div class="pest" role="tablist">
          <button class="on" data-tab="tabCapas">Capas vectoriales (${nCapas})</button>
          <button data-tab="tabRep">Estructura del repositorio de la tesis</button>
        </div>

        <div id="tabCapas">
          <input type="search" class="filtro-cat" id="filtroCapas" placeholder="🔍 Filtrar capas por nombre, geometría o fuente SIG…">
          <table class="cat" id="tablaCat">
            <thead>
              <tr>
                <th>Capa / Archivo</th>
                <th>Tipo</th>
                <th class="num">Elementos</th>
                <th>CRS Origen</th>
                <th>Fuente original en SIG</th>
                <th>Acceso</th>
              </tr>
            </thead>
            <tbody>${filasHtml}</tbody>
          </table>
        </div>

        <div id="tabRep" hidden>
          <div class="arb-rep">${repHtml}</div>
        </div>
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

  // --- PÁGINA: ACERCA DE (#pgAcerca) ---
  function renderAcerca() {
    const pg = document.getElementById('pgAcerca');
    if (!pg || pg.children.length > 0) return;

    const meta = CATALOGO.meta || {};

    pg.innerHTML = `
      <div class="ancho">
        <h1>Acerca del Geovisor y la Investigación Doctoral</h1>
        <p class="lead">
          Este geovisor es el instrumento cartográfico y metodológico interactivo desarrollado como componente integral de la tesis doctoral en Sostenibilidad de la Universitat Politècnica de Catalunya (UPC).
        </p>

        <h2>Ficha técnica doctoral</h2>
        <table class="cat" style="max-width:760px;margin-bottom:24px">
          <tbody>
            <tr><td style="width:220px"><strong>Título de la tesis</strong></td><td>${meta.titulo}</td></tr>
            <tr><td><strong>Subtítulo</strong></td><td>${meta.subtitulo}</td></tr>
            <tr><td><strong>Doctoranda</strong></td><td>${meta.autora}</td></tr>
            <tr><td><strong>Dirección de tesis</strong></td><td>${meta.directores}</td></tr>
            <tr><td><strong>Institución</strong></td><td>${meta.universidad} · ${meta.programa}</td></tr>
            <tr><td><strong>Año de sustentación</strong></td><td>${meta.anio}</td></tr>
            <tr><td><strong>Manuscrito de referencia</strong></td><td><code>${meta.manuscrito}</code></td></tr>
          </tbody>
        </table>

        <h2>Objetivo y alcance de la plataforma</h2>
        <p>
          La investigación aborda la complejidad de las franjas de interfaz urbano-rural en ciudades portuarias de América Latina, con énfasis focalizado en el Área Metropolitana de Barranquilla (AMB) como caso de estudio central (ciudad puerto y ciudad río), en comparación sistemática con Veracruz (México), Santos (Brasil) y Valparaíso (Chile).
        </p>
        <p>
          Para superar las limitaciones de la visualización estática en papel y PDF, este geovisor permite examinar cada una de las salidas cartográficas generadas en QGIS con fidelidad total a su simbología, encuadre original, jerarquía de capas, etiquetas y base de datos alfanumérica.
        </p>

        <h2>Arquitectura y tecnologías abiertas</h2>
        <p>
          Desarrollado sobre estándares abiertos y software libre:
        </p>
        <ul>
          <li><strong>QGIS 3.x:</strong> Procesamiento territorial, diseño cartográfico, layouts y modelos de clasificación.</li>
          <li><strong>MapLibre GL JS:</strong> Motor de renderizado vectorial WebGL de alto desempeño para mapas interactivos.</li>
          <li><strong>GeoPandas & Python:</strong> Extracción de metadatos, optimización de topologías y generación del catálogo de capas.</li>
          <li><strong>Proj4js:</strong> Transformación de coordenadas en tiempo real al Sistema MAGNA-SIRGAS 2018 / Origen Nacional (EPSG:9377).</li>
        </ul>
      </div>
    `;
  }

  // --- CONTROLADOR DE PÁGINAS PRINCIPALES ---
  function showPage(pageId) {
    ['pgInicio', 'pgElemento', 'pgDatos', 'pgAcerca'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = id !== pageId;
    });

    document.querySelectorAll('.nav a').forEach((a) => {
      const target = a.getAttribute('data-nav');
      if (pageId === 'pgInicio' && target === 'inicio') a.classList.add('on');
      else if (pageId === 'pgDatos' && target === 'datos') a.classList.add('on');
      else if (pageId === 'pgAcerca' && target === 'acerca') a.classList.add('on');
      else a.classList.remove('on');
    });

    document.getElementById('indice')?.classList.remove('abierto');
  }

  // --- ÁRBOL DE CONTENIDO E ÍNDICE LATERAL (#arbol) ---
  function renderArbol() {
    const arbol = document.getElementById('arbol');
    if (!arbol || !CATALOGO) return;
    arbol.innerHTML = '';

    const caps = CATALOGO.capitulos || [];
    const items = CATALOGO.items || [];

    caps.forEach((cap) => {
      const capItems = items.filter((it) => it.capitulo === cap.id);
      if (!capItems.length) return;

      const det = document.createElement('details');
      det.className = 'cap';
      det.open = true;
      det.setAttribute('data-cap', cap.id);

      det.innerHTML = `
        <summary>
          <span class="rom">Cap. ${cap.num}</span>
          <span class="tit">${cap.nombre}</span>
          <span class="n">${capItems.length}</span>
        </summary>
        <div class="cap-items"></div>
      `;

      const contItems = det.querySelector('.cap-items');
      capItems.forEach((it) => {
        const a = document.createElement('a');
        a.className = `it t-${it.tipo}`;
        a.href = `#/${it.id}`;
        a.setAttribute('data-id', it.id);
        a.setAttribute('data-tipo', it.tipo);
        a.setAttribute('data-txt', `${it.etiqueta} ${it.titulo} ${(it.ruta || []).join(' ')}`.toLowerCase());

        a.innerHTML = `
          <span class="eti">${it.etiqueta}</span>
          <span class="txt">${it.titulo}</span>
        `;
        contItems.appendChild(a);
      });

      arbol.appendChild(det);
    });

    initFiltroIndice();
  }

  function initFiltroIndice() {
    const buscar = document.getElementById('buscar');
    const chips = document.getElementById('chips');
    let filtroTipo = 'todos';

    function filtrar() {
      const q = (buscar?.value || '').trim().toLowerCase();
      const allItems = document.querySelectorAll('#arbol .it');
      const allCaps = document.querySelectorAll('#arbol details.cap');

      allItems.forEach((it) => {
        const tipo = it.getAttribute('data-tipo');
        const txt = it.getAttribute('data-txt') || '';

        const matchTipo = filtroTipo === 'todos' || tipo === filtroTipo;
        const matchTxt = !q || txt.includes(q);

        const visible = matchTipo && matchTxt;
        it.hidden = !visible;
      });

      allCaps.forEach((cap) => {
        const visiblesEnCap = cap.querySelectorAll('.it:not([hidden])').length;
        cap.hidden = visiblesEnCap === 0;
        if (q && visiblesEnCap > 0) cap.open = true;
      });
    }

    buscar?.addEventListener('input', filtrar);

    chips?.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        chips.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        filtroTipo = btn.getAttribute('data-f') || 'todos';
        filtrar();
      });
    });
  }

  // --- ENRUTADOR PRINCIPAL (HASH ROUTING) ---
  function router() {
    const hash = window.location.hash || '#/';

    if (hash === '#/' || hash === '#' || hash === '') {
      renderInicio();
      showPage('pgInicio');
      document.title = 'Geovisor · Tesis Doctoral UPC — Aida Palmett';
      document.querySelectorAll('#arbol .it').forEach((el) => el.classList.remove('on'));
    } else if (hash === '#/datos') {
      renderDatos();
      showPage('pgDatos');
      document.title = 'Capas y Datos SIG · Geovisor Tesis Doctoral';
      document.querySelectorAll('#arbol .it').forEach((el) => el.classList.remove('on'));
    } else if (hash === '#/acerca') {
      renderAcerca();
      showPage('pgAcerca');
      document.title = 'Acerca de · Geovisor Tesis Doctoral';
      document.querySelectorAll('#arbol .it').forEach((el) => el.classList.remove('on'));
    } else {
      const id = hash.replace(/^#\//, '');
      showElement(id);
    }
  }

  function navigate(hash) {
    if (window.location.hash === hash) {
      router();
    } else {
      window.location.hash = hash;
    }
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

  // --- MODO 3D / PERSPECTIVA DE PAISAJE ---
  let modo3D = false;
  function init3DToggle() {
    const btn3D = document.getElementById('btn3D');
    const lbl3D = document.getElementById('lbl3D');
    if (!btn3D) return;

    btn3D.addEventListener('click', () => {
      if (!map || !mapReady) return;
      modo3D = !modo3D;
      btn3D.classList.toggle('on', modo3D);
      if (lbl3D) lbl3D.textContent = modo3D ? '2D' : '3D';

      if (modo3D) {
        map.easeTo({
          pitch: 55,
          bearing: -15,
          duration: 900
        });
        showToast('Perspectiva 3D activada (inclinación 55°)');
      } else {
        map.easeTo({
          pitch: 0,
          bearing: 0,
          duration: 900
        });
        showToast('Vista plana 2D restablecida');
      }
    });
  }

  // --- SALTOS ESPACIALES RÁPIDOS A NODOS Y ESTRUCTURA TERRITORIAL ---
  const SALTOS_COORDS = {
    amb: { center: [-74.83, 10.95], zoom: 10.3, pitch: 0, bearing: 0 },
    franja: { center: [-74.845, 10.94], zoom: 11.2, pitch: 25, bearing: -5 },
    nodo1: { center: [-74.881, 11.041], zoom: 13.8, pitch: 45, bearing: 10 },
    nodo2: { center: [-74.883, 10.895], zoom: 13.8, pitch: 45, bearing: -10 },
    nodo3: { center: [-74.836, 10.942], zoom: 13.8, pitch: 45, bearing: 0 },
    nodo4: { center: [-74.762, 10.846], zoom: 13.8, pitch: 45, bearing: 15 },
    puerto: { center: [-74.740, 10.893], zoom: 14.0, pitch: 50, bearing: -20 },
    mallorquin: { center: [-74.848, 11.055], zoom: 13.0, pitch: 35, bearing: 5 }
  };

  function initSaltosRapidos() {
    const btn = document.getElementById('btnSaltos');
    const menu = document.getElementById('menuSaltos');
    if (!btn || !menu) return;

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
    });

    document.addEventListener('click', () => {
      menu.hidden = true;
    });

    menu.querySelectorAll('button[data-salto]').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.hidden = true;
        const key = b.getAttribute('data-salto');
        const conf = SALTOS_COORDS[key];
        if (conf && map && mapReady) {
          map.flyTo({
            center: conf.center,
            zoom: conf.zoom,
            pitch: conf.pitch,
            bearing: conf.bearing,
            duration: 1600,
            essential: true
          });
        }
      });
    });
  }

  // --- CAPTURA DE ALTA RESOLUCIÓN DEL LIENZO CARTOGRÁFICO ---
  function initCapturaMapa() {
    const btn = document.getElementById('btnCapturaMapa');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!map || !mapReady) return;
      try {
        const mapCanvas = map.getCanvas();
        const exportCanvas = document.createElement('canvas');
        const ctx = exportCanvas.getContext('2d');

        const padTop = 64;
        const padBottom = 38;
        exportCanvas.width = mapCanvas.width;
        exportCanvas.height = mapCanvas.height + padTop + padBottom;

        ctx.fillStyle = '#071527';
        ctx.fillRect(0, 0, exportCanvas.width, padTop);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, padTop, exportCanvas.width, mapCanvas.height);
        ctx.fillStyle = '#071527';
        ctx.fillRect(0, padTop + mapCanvas.height, exportCanvas.width, padBottom);

        ctx.drawImage(mapCanvas, 0, padTop);

        ctx.fillStyle = '#d49a37';
        ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('GeoInterfaz UPC · Plataforma Cartográfica Doctoral', 24, 26);

        ctx.fillStyle = '#ffffff';
        ctx.font = '13.5px "Plus Jakarta Sans", sans-serif';
        const tit = currentItem ? `${currentItem.etiqueta}: ${currentItem.titulo}` : 'Cartografía de Franjas de Interfaz';
        ctx.fillText(tit.slice(0, 95), 24, 48);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Aida del Carmen Palmett Padilla (2026) · Universitat Politècnica de Catalunya', 24, exportCanvas.height - 15);

        const link = document.createElement('a');
        link.download = `GeoInterfaz_${currentItem?.id || 'mapa'}_lamina.png`;
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
        showToast('📸 Lámina cartográfica capturada con éxito en alta resolución');
      } catch (err) {
        console.warn('Error capturando mapa:', err);
        showToast('Nota: La captura requiere aceleración gráfica compatible');
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
          <span class="cmd-item-cap">${it.tipo === 'mapa' ? '🗺️ Mapa' : it.clase}</span>
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

  // --- INICIALIZACIÓN GLOBAL DE LA APLICACIÓN ---
  async function initApp() {
    try {
      const [resCat, resVis, resCap] = await Promise.all([
        fetch('data/catalogo.json'),
        fetch('data/vistas.json'),
        fetch('data/capas.json')
      ]);

      CATALOGO = await resCat.json();
      VISTAS = await resVis.json();
      CAPAS = await resCap.json();

      (CATALOGO.items || []).forEach((it) => {
        ITEMS_MAP.set(it.id, it);
      });

      renderArbol();
      initZoomer();
      initCommandPalette();
      initHerramientaMedicion();
      init3DToggle();
      initSaltosRapidos();
      initCapturaMapa();

      document.getElementById('btnMenu')?.addEventListener('click', () => {
        document.getElementById('indice')?.classList.toggle('abierto');
      });

      document.getElementById('btnPlegar')?.addEventListener('click', () => {
        const p = document.getElementById('panel');
        if (p) {
          p.classList.toggle('cerrado');
          setTimeout(() => {
            if (map && mapReady) {
              map.resize();
              if (currentVista) ajustarEncuadreVista(currentVista);
            }
          }, 260);
        }
      });

      document.getElementById('cajonCerrar')?.addEventListener('click', () => {
        document.getElementById('cajon').hidden = true;
      });

      const dlgInst = document.getElementById('dlgInstituciones');
      document.getElementById('btnInstituciones')?.addEventListener('click', () => {
        dlgInst?.showModal();
      });
      document.getElementById('btnCerrarInst')?.addEventListener('click', () => {
        dlgInst?.close();
      });
      dlgInst?.addEventListener('click', (e) => {
        if (e.target === dlgInst) dlgInst.close();
      });

      document.querySelectorAll('#bases .base-card').forEach((card) => {
        card.addEventListener('click', () => {
          const val = card.getAttribute('data-base');
          if (val) setBaseMap(val);
        });
      });

      document.querySelectorAll('#bases input[name="base"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) setBaseMap(radio.value);
        });
      });

      window.addEventListener('hashchange', router);
      router();
    } catch (err) {
      console.error('Error inicializando el geovisor:', err);
      document.getElementById('principal').innerHTML = `
        <div style="padding:40px;color:#c00">
          <h2>Error al cargar los datos del geovisor</h2>
          <p>${err.message}</p>
        </div>
      `;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
