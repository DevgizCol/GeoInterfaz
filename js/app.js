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

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
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

      map.on('click', (e) => {
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
          layerObj = currentVista.capas.find((c) => f.layer.id.startsWith(`lyr_${c.capa}_`));
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
        const visibleLayers = activeVectorLayerIds.filter((id) => {
          const l = map.getLayer(id);
          return l && map.getLayoutProperty(id, 'visibility') !== 'none' && !id.endsWith('__label');
        });
        if (!visibleLayers.length) {
          map.getCanvas().style.cursor = '';
          return;
        }
        const features = map.queryRenderedFeatures(e.point, { layers: visibleLayers });
        map.getCanvas().style.cursor = features.length ? 'pointer' : '';
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

  function applyVistaLayers(vista) {
    if (!map || !mapReady) return;

    // Limpiar capas vectoriales y fuentes anteriores
    activeVectorLayerIds.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    activeVectorSourceIds.forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
    activeVectorLayerIds = [];
    activeVectorSourceIds = [];

    // Ajustar encuadre espacial
    if (vista.bbox && vista.bbox.length === 4) {
      const bounds = [
        [vista.bbox[0], vista.bbox[1]],
        [vista.bbox[2], vista.bbox[3]]
      ];
      map.fitBounds(bounds, {
        padding: { top: 35, bottom: 35, left: 35, right: 310 },
        maxZoom: 16.5,
        duration: 800
      });
    }

    // Configurar mapa base predeterminado de la vista
    const baseOpt = vista.fondo || 'osm';
    const radio = document.querySelector(`input[name="base"][value="${baseOpt}"]`);
    if (radio) {
      radio.checked = true;
      setBaseMap(baseOpt);
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
      const srcId = `src_${capaObj.capa}`;

      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: 'geojson',
          data: `data/capas/${capaObj.capa}.geojson`
        });
        activeVectorSourceIds.push(srcId);
      }

      if (capaObj.estilo && capaObj.estilo.ml) {
        capaObj.estilo.ml.forEach((ml, subIdx) => {
          const lyrId = `lyr_${capaObj.capa}_${subIdx}`;
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
          map.addLayer(lyrDef);
          activeVectorLayerIds.push(lyrId);
        });
      }

      if (capaObj.estilo && capaObj.estilo.etiqueta) {
        const etq = capaObj.estilo.etiqueta;
        const lblId = `lyr_${capaObj.capa}__label`;
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
        map.addLayer(lblDef);
        activeVectorLayerIds.push(lblId);
      }
    }
  }

  function renderListaCapas(vista) {
    const cont = document.getElementById('listaCapas');
    if (!cont) return;
    cont.innerHTML = '';

    vista.capas.forEach((capaObj) => {
      const capaEl = document.createElement('div');
      capaEl.className = `capa${capaObj.apagada ? ' off' : ''}`;
      capaEl.id = `ui_capa_${capaObj.capa}`;

      const leyHtml = capaObj.estilo && capaObj.estilo.leyenda
        ? capaObj.estilo.leyenda
            .map((item) => `<div>${createLegendSvg(item.m)}<span title="${item.etq}">${item.etq}</span></div>`)
            .join('')
        : '';

      capaEl.innerHTML = `
        <div class="capa-tit">
          <input type="checkbox" id="chk_${capaObj.capa}" ${capaObj.apagada ? '' : 'checked'}>
          <label for="chk_${capaObj.capa}">${capaObj.nombre}</label>
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
        if (map && mapReady) {
          activeVectorLayerIds.forEach((id) => {
            if (id.startsWith(`lyr_${capaObj.capa}_`) || id === `lyr_${capaObj.capa}__label`) {
              if (map.getLayer(id)) {
                map.setLayoutProperty(id, 'visibility', encendida ? 'visible' : 'none');
              }
            }
          });
        }
      });

      const opInput = capaEl.querySelector(`input[data-op]`);
      opInput.addEventListener('input', () => {
        const val = parseFloat(opInput.value) / 100;
        if (map && mapReady) {
          activeVectorLayerIds.forEach((id) => {
            if (id.startsWith(`lyr_${capaObj.capa}_`)) {
              const l = map.getLayer(id);
              if (!l) return;
              if (l.type === 'fill') map.setPaintProperty(id, 'fill-opacity', val);
              else if (l.type === 'line') map.setPaintProperty(id, 'line-opacity', val);
              else if (l.type === 'circle') map.setPaintProperty(id, 'circle-opacity', val);
              else if (l.type === 'symbol') map.setPaintProperty(id, 'icon-opacity', val);
            }
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

  // --- CAMBIO DE VISTA DEL LIENZO (MAPA / LÁMINA / DOCUMENTO) ---
  function switchLienzoView(mode) {
    const visMapa = document.getElementById('visMapa');
    const visImagen = document.getElementById('visImagen');
    const visDoc = document.getElementById('visDoc');
    const segButtons = document.querySelectorAll('#cabecera .seg button');

    visMapa.hidden = mode !== 'mapa';
    visImagen.hidden = mode !== 'imagen';
    visDoc.hidden = mode !== 'doc';

    segButtons.forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-v') === mode);
    });

    if (mode === 'mapa' && map && mapReady) {
      setTimeout(() => map.resize(), 60);
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
    const hasMapa = Boolean(item.vista);
    const hasLamina = Boolean(item.lamina && item.lamina.src);
    const hasFiguraImg = Boolean(item.imagenes && item.imagenes.length);
    const hasImagen = hasLamina || hasFiguraImg;
    const hasDoc = Boolean(item.tabla || hasFiguraImg);

    let segHtml = '';
    if (hasMapa && hasImagen) {
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
          ${relBtn}
          <button class="btn pri" id="btnCompartir">📤 Compartir / Citar</button>
        </div>
      </div>
      ${notaHtml}
    `;

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

    if (hasMapa) {
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
    } else if (hasFiguraImg) {
      visDoc.innerHTML = `
        <div class="hoja" style="text-align:center">
          <h2>${item.etiqueta} · Gráfico extraído del manuscrito</h2>
          <img class="fig-img" src="data/${item.imagenes[0].src}" alt="${item.titulo}">
        </div>
      `;
    }
  }

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

    const destacados = [
      'fig-1',
      'fig-2',
      'fig-3',
      'fig-4',
      'atlas-3-8',
      'atlas-3-9',
      'atlas-3-10',
      'fig-40',
      'fig-43',
      'fig-46',
      'fig-52',
      'fig-56',
      'fig-63',
      'tabla-74'
    ]
      .map((id) => ITEMS_MAP.get(id))
      .filter(Boolean);

    const cardsHtml = destacados
      .map(
        (it) => `
        <a class="tarj t-${it.tipo}" href="#/${it.id}">
          <div class="img" style="background-image:url('data/${it.mini || 'logo_upc.png'}')"></div>
          <div class="pie">
            <span class="eti">${it.etiqueta}</span>
            <div style="font-weight:600;margin-top:2px">${it.titulo}</div>
          </div>
        </a>
      `
      )
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

      <div class="inicio-cuerpo">
        <div class="como">
          <strong>💡 Plataforma cartográfica para la evaluación doctoral:</strong>
          Cada mapa, lámina del atlas, tabla de encuestas y esquema conceptual cuenta con un identificador único y permalink propio (ej: <code>#/fig-3</code>, <code>#/atlas-3-8</code>).
          En el botón <em>Compartir / Citar</em> de cada vista obtendrá el enlace directo y el código QR oficial para anexar en la nota de cada mapa de su manuscrito, permitiendo a los directores y jurados evaluar las capas, simbología de QGIS y atributos espaciales en vivo.
        </div>

        <h2>Cartografía y salidas destacadas de la investigación <small>Selección representativa de los Capítulos I al V</small></h2>
        <div class="rejilla">${cardsHtml}</div>
      </div>
    `;

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

      document.getElementById('btnMenu')?.addEventListener('click', () => {
        document.getElementById('indice')?.classList.toggle('abierto');
      });

      document.getElementById('btnPlegar')?.addEventListener('click', () => {
        document.getElementById('panel')?.classList.toggle('cerrado');
      });

      document.getElementById('cajonCerrar')?.addEventListener('click', () => {
        document.getElementById('cajon').hidden = true;
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
