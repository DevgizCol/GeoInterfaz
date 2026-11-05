/* Mundo 3D (#/mundo): la propuesta de la tesis sobre el terreno real, en CesiumJS.
 * Cesium se carga solo al entrar (jsDelivr, versión fija). Token público de solo lectura en js/config_cesium.js.
 * Recorrido narrado en 5 pasos + exploración libre: volar (ratón), dron (W A S D, Q/E altura) y caminar (1,7 m).
 * UFP y nodos: lineamientos; macromanzanas: propuesta; usos 2035: escenarios hipotéticos. */
(function () {
  'use strict';
  const VER = '1.147.0';
  const CDN = `https://cdn.jsdelivr.net/npm/cesium@${VER}/Build/Cesium/`;
  const C = 'data/capas/';
  let viewer = null, Cs = null, ciudad = null, modo = 'volar', paso = 0, dronAlt = 45;
  const $ = (id) => document.getElementById(id);
  const UFP = { 'UFP 1': '#8e44ad', 'UFP 2': '#d9332b', 'UFP 3': '#e6a817', 'UFP 4': '#2e9d4b' };
  const VOC = { 'Conservación y restauración ecológica': '#3f8f4f', 'Agroforestal de transición': '#9bbf5a', 'Agroindustrial': '#d9b44a', 'Residencial mixta consolidada': '#c76b4a',
    'Residencial mixta de expansión': '#e39a6f', 'Reserva logística del corredor Circunvalar': '#7d6bb0', 'Logística y retroportuaria': '#4b5d8c' };

  const PASOS = [
    { tit: 'El territorio', cam: [-74.86, 10.84, 16000, 350, -24], capas: [],
      txt: 'Barranquilla entre el mar Caribe, el río Magdalena y la ciénaga de Mallorquín. Al occidente, los cerros desde donde baja el agua hacia la ciénaga y el mar.' },
    { tit: 'La franja de interfaz urbano-rural', cam: [-74.885, 10.87, 10000, 350, -30], capas: ['franja'],
      txt: 'El objeto de la tesis: 18.577 ha entre la ciudad construida y el campo, delimitadas por cuenca, es decir, por el suelo cuya agua escurre hacia la ciénaga y el mar.' },
    { tit: 'Las unidades de paisaje', cam: [-74.9, 10.885, 8500, 10, -34], capas: ['franja', 'unidades'],
      txt: 'Cuatro unidades según hacia qué arroyo drena cada terreno: el agua es la protagonista. Las líneas azules son los cauces, más gruesas cuanto mayor es su orden de Strahler.' },
    { tit: 'Los lineamientos: UFP, nodos y corredores', cam: [-74.885, 10.88, 9000, 345, -32], capas: ['franja', 'ufp'],
      txt: 'La tesis propone como lineamientos cuatro Unidades Funcionales de Planificación (UFP), seis nodos que articulan la franja y los corredores que la conectan, con la Circunvalar de la Prosperidad como eje.' },
    { tit: 'La propuesta: macromanzanas', cam: [-74.875, 10.925, 3800, 330, -28], capas: ['franja', 'macro'],
      txt: '367 macromanzanas que agrupan manzanas y predios, cada una con una vocación; la altura indica el porcentaje de suelo construido hoy. Toque una para ver sus escenarios 2035 (hipotéticos).' }
  ];

  const cargar = () => new Promise((ok, ko) => {
    if (window.Cesium) return ok(window.Cesium);
    window.CESIUM_BASE_URL = CDN;
    // shortcut: Cesium 1.147 pide imageOrientation 'none', que Chrome renombró a 'from-image' (mismo efecto); quitar cuando Cesium lo actualice
    const cib = window.createImageBitmap;
    if (cib && !cib.__gi) {
      window.createImageBitmap = function (img, ...r) {
        const o = r[r.length - 1];
        if (o && typeof o === 'object' && o.imageOrientation === 'none') r[r.length - 1] = { ...o, imageOrientation: 'from-image' };
        return cib.call(this, img, ...r);
      };
      window.createImageBitmap.__gi = true;
    }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = CDN + 'Widgets/widgets.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = CDN + 'Cesium.js'; s.onload = () => ok(window.Cesium); s.onerror = () => ko(new Error('No se pudo cargar CesiumJS'));
    document.head.appendChild(s);
  });
  const color = (c, a = 1) => Cs.Color.fromCssColorString(c).withAlpha(a);
  const geo = (f, o = {}) => Cs.GeoJsonDataSource.load(C + f, { clampToGround: true, ...o });
  const grupo = (d, nombre) => { d.name = nombre; viewer.dataSources.add(d); return d; };

  const CREA = {};  // grupo -> función que lo construye; se llama una sola vez, al mostrarlo por primera vez
  const hechos = new Set();
  function capas() {
  CREA.franja = async () => {
    const fr = await geo('franja_interface_urbano_rural_amb_integrada.geojson', { fill: color('#c0271d', .3) });
    fr.entities.values.forEach((e) => { if (e.polygon) e.polygon.outline = false; });
    grupo(fr, 'franja');
    const borde = await geo('franja_interface_urbano_rural_amb_integrada.geojson');
    borde.entities.values.forEach((e) => {
      if (!e.polygon) return;
      const h = e.polygon.hierarchy.getValue(); e.polygon = undefined;
      e.polyline = new Cs.PolylineGraphics({ positions: [...h.positions, h.positions[0]], width: 3, clampToGround: true, material: color('#f0c987') });
    });
    grupo(borde, 'franja');
  };
  CREA.unidades = async () => {
    const un = await geo('unidades_paisaje_subcuenca.geojson');
    un.entities.values.forEach((e) => { if (e.polygon) { e.polygon.material = color(e.properties.color.getValue(), .45); e.polygon.outline = false; } });
    grupo(un, 'unidades');
    const ca = await geo('maqueta_cauces_strahler.geojson');
    ca.entities.values.forEach((e) => { if (e.polyline) { e.polyline.width = 1 + e.properties.orden.getValue() * .9; e.polyline.material = color('#7fd3ff'); } });
    grupo(ca, 'unidades');
  };
  CREA.ufp = async () => {
    const uf = await geo('ufps.geojson');
    uf.entities.values.forEach((e) => { if (e.polygon) { e.polygon.material = color(UFP[String(e.properties['Categoría'].getValue()).slice(0, 5)] || '#888', .4); e.polygon.outline = false; } });
    grupo(uf, 'ufp');
    for (const [f, c, w] of [['corredores_economicos.geojson', '#111111', 3], ['circunvalar_prosperidad.geojson', '#5b2a86', 5]]) {
      const d = await geo(f);
      d.entities.values.forEach((e) => { if (e.polyline) { e.polyline.width = w; e.polyline.material = color(c); } });
      grupo(d, 'ufp');
    }
    const no = await Cs.GeoJsonDataSource.load(C + 'nodos.geojson');
    no.entities.values.forEach((e) => {
      e.billboard = undefined;
      e.point = new Cs.PointGraphics({ pixelSize: 13, color: color('#c0271d'), outlineColor: Cs.Color.WHITE, outlineWidth: 2, heightReference: Cs.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY });
      e.label = new Cs.LabelGraphics({ text: e.properties.NOMBRE.getValue(), font: '600 13px "Plus Jakarta Sans", sans-serif', fillColor: Cs.Color.WHITE, outlineColor: color('#12324f'), outlineWidth: 3,
        style: Cs.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cs.Cartesian2(0, -20), heightReference: Cs.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY });
    });
    grupo(no, 'ufp');
  };
  CREA.macro = async () => {
    const mm = await Cs.GeoJsonDataSource.load(C + 'maqueta_macromanzanas.geojson');
    mm.entities.values.forEach((e) => {
      if (!e.polygon) return;
      const p = e.properties;
      e.polygon.material = color(VOC[p.vocacion_nombre.getValue()] || '#999', .9);
      e._alto = 8 + 2 * (p.pct_construido.getValue() || 0);
      e.polygon.outline = false;
      e.description = `<p><b>${p.id.getValue()}</b> · ${p.UFP.getValue().replace('_', ' ')}<br>${p.vocacion_nombre.getValue()}<br>${Number(p.ha.getValue()).toLocaleString('es-CO')} ha · ${p.pct_construido.getValue()} % construido hoy<br>` +
        `2035 tendencial: ${p.uso_2035_tendencial.getValue()}<br>2035 IOTF: ${p.uso_2035_iotf.getValue()} (escenarios hipotéticos)</p>`;
    });
    // altura del terreno en el centro de cada macromanzana: una sola consulta asíncrona para las 367 (no congela)
    const ents = mm.entities.values.filter((e) => e.polygon);
    const centros = ents.map((e) => Cs.Cartographic.fromCartesian(Cs.BoundingSphere.fromPoints(e.polygon.hierarchy.getValue().positions).center));
    try { await Cs.sampleTerrainMostDetailed(viewer.terrainProvider, centros); } catch (_) { centros.forEach((c) => { c.height = 20; }); }
    // shortcut: un solo nivel de base por macromanzana (su centro); en laderas fuertes un borde puede quedar algo por encima o por debajo
    ents.forEach((e, i) => { const z = centros[i].height || 0; e.polygon.height = z; e.polygon.extrudedHeight = z + e._alto; });
    grupo(mm, 'macro');
  };
  }

  async function capa(nombre, ver) {
    if (ver && !hechos.has(nombre) && CREA[nombre]) { hechos.add(nombre); await CREA[nombre](); }
    for (let i = 0; i < viewer.dataSources.length; i++) { const d = viewer.dataSources.get(i); if (d.name === nombre) d.show = ver; }
    viewer.scene.requestRender();
  }
  function marcarCapas(lista) {
    document.querySelectorAll('.mu-capas input').forEach((i) => { i.checked = lista.includes(i.dataset.k); if (i.checked || hechos.has(i.dataset.k)) capa(i.dataset.k, i.checked); });
  }

  async function ponerCiudad(tipo) {
    if (ciudad) { viewer.scene.primitives.remove(ciudad); ciudad = null; }
    viewer.scene.globe.show = true;
    try {
      ciudad = tipo === 'google' ? await Cs.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true, maximumScreenSpaceError: 24 }) : await Cs.createOsmBuildingsAsync();
      viewer.scene.primitives.add(ciudad);
      if (tipo === 'google') viewer.scene.globe.show = false;  // la malla de Google ya trae el terreno
    } catch (e) {
      console.warn('Ciudad 3D no disponible:', e.message);
      if (tipo === 'google') return ponerCiudad('osm');  // sin cuota o sin red de Google: edificios de OpenStreetMap
    }
    document.querySelectorAll('#muCiudad button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === tipo)));
  }

  const ir = (c, dur = 2.8) => viewer.camera.flyTo({ destination: Cs.Cartesian3.fromDegrees(c[0], c[1], c[2]), orientation: { heading: Cs.Math.toRadians(c[3]), pitch: Cs.Math.toRadians(c[4]), roll: 0 },
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : dur });

  function irPaso(n) {
    paso = Math.max(0, Math.min(PASOS.length - 1, n));
    const P = PASOS[paso];
    if (modo !== 'volar') ponerModo('volar', true);
    marcarCapas(P.capas);
    ir(P.cam);
    $('muN').textContent = `${paso + 1} / ${PASOS.length}`; $('muTit').textContent = P.tit; $('muTxt').textContent = P.txt;
    document.querySelectorAll('#muPuntos button').forEach((b, i) => b.setAttribute('aria-current', String(i === paso)));
    $('muAnt').disabled = paso === 0; $('muSig').disabled = paso === PASOS.length - 1;
  }

  // --- dron y caminar: la cámara sigue el terreno a una altura fija; W A S D / flechas mueven, ratón mira
  const teclas = new Set();
  let ultimo = performance.now();
  function mover() {
    const t = performance.now(), dt = Math.min(.1, (t - ultimo) / 1000); ultimo = t;
    if (modo === 'volar') return;
    const cam = viewer.camera, rapido = teclas.has('ShiftLeft') || teclas.has('ShiftRight');
    const v = (modo === 'dron' ? (rapido ? 160 : 45) : (rapido ? 60 : 15)) * dt;  // m/s
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) cam.moveForward(v);
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) cam.moveBackward(v);
    if (teclas.has('KeyA') || teclas.has('ArrowLeft')) cam.moveLeft(v);
    if (teclas.has('KeyD') || teclas.has('ArrowRight')) cam.moveRight(v);
    if (modo === 'dron' && teclas.has('KeyE')) dronAlt = Math.min(400, dronAlt + 40 * dt);
    if (modo === 'dron' && teclas.has('KeyQ')) dronAlt = Math.max(12, dronAlt - 40 * dt);
    const c = Cs.Cartographic.fromCartesian(cam.position);
    const suelo = viewer.scene.globe.show ? viewer.scene.globe.getHeight(c) : viewer.scene.sampleHeight(c, [], 1);
    if (suelo !== undefined) cam.setView({ destination: Cs.Cartesian3.fromRadians(c.longitude, c.latitude, suelo + (modo === 'dron' ? dronAlt : 1.7)), orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 } });
  }
  function ponerModo(m, silencio) {
    modo = m;
    const ctl = viewer.scene.screenSpaceCameraController, libre = m === 'volar';
    ctl.enableTranslate = ctl.enableZoom = ctl.enableTilt = ctl.enableRotate = libre;
    ctl.enableLook = true;
    // a baja altura los volúmenes de las macromanzanas tapan la vista: se ocultan
    if (!libre) capa('macro', false);
    if (!silencio && !libre) {
      const lon = -74.905, lat = 10.965, h = (viewer.scene.globe.getHeight(Cs.Cartographic.fromDegrees(lon, lat)) || 40) + (m === 'dron' ? dronAlt : 1.7);
      viewer.camera.flyTo({ destination: Cs.Cartesian3.fromDegrees(lon, lat, h), orientation: { heading: Cs.Math.toRadians(20), pitch: Cs.Math.toRadians(m === 'dron' ? -15 : -4), roll: 0 }, duration: 2.5 });
    }
    document.querySelectorAll('#muModo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    $('muAyuda').textContent = { volar: 'Arrastre para girar, rueda para acercarse, Ctrl + arrastrar para inclinar.',
      dron: 'Dron a ' + Math.round(dronAlt) + ' m: W A S D o flechas para avanzar, Q / E para bajar o subir, Mayús para ir rápido; arrastre para mirar.',
      caminar: 'A pie (1,7 m): W A S D o flechas, Mayús para correr; arrastre para mirar.' }[m];
  }

  async function montar() {
    const pg = $('pgMundo');
    pg.innerHTML = `
      <div id="muMapa" class="mq-mapa"></div>
      <aside class="mq-panel mu-panel" aria-live="polite">
        <div class="mq-cab"><span class="mq-eti">Mundo 3D de la propuesta</span><span id="muN" class="mq-n"></span></div>
        <h2 id="muTit">Cargando el mundo 3D…</h2>
        <p id="muTxt" class="mu-txt">Terreno, ciudad y capas de la tesis.</p>
        <div class="mq-pie">
          <div id="muPuntos" class="mq-puntos">${PASOS.map((p, i) => `<button aria-label="Paso ${i + 1}: ${p.tit}"></button>`).join('')}</div>
          <div class="mq-nav"><button id="muAnt" class="btn">← Anterior</button><button id="muSig" class="btn pri">Siguiente →</button></div>
        </div>
        <details class="mu-libre"><summary>Explorar libremente</summary>
          <div class="mu-grupo"><span>Recorrer</span><div id="muModo" class="mq-modos"><button data-m="volar" aria-pressed="true">Volar</button><button data-m="dron">Dron</button><button data-m="caminar">Caminar</button></div></div>
          <div class="mu-grupo"><span>Ciudad</span><div id="muCiudad" class="mq-modos"><button data-c="google">Google 3D</button><button data-c="osm">Edificios OSM</button></div></div>
          <div class="mu-grupo"><span>Capas</span><div class="mu-capas">
            <label><input type="checkbox" data-k="franja"> Franja de interfaz (18.577 ha)</label>
            <label><input type="checkbox" data-k="unidades"> Unidades de paisaje y cauces</label>
            <label><input type="checkbox" data-k="ufp"> Lineamientos: UFP, nodos y corredores</label>
            <label><input type="checkbox" data-k="macro"> Macromanzanas (propuesta)</label></div></div>
          <p id="muAyuda" class="mq-nota"></p>
        </details>
        <p class="mq-nota mu-pie-nota"><a href="#/maqueta">Versión ligera</a> · Terreno: Cesium World Terrain. Ciudad: Google / OpenStreetMap. UFP y nodos: lineamientos; macromanzanas: propuesta; 2035: escenarios hipotéticos.</p>
      </aside>`;
    try { Cs = await cargar(); } catch (e) { $('muTit').textContent = 'El mundo 3D no pudo cargarse'; $('muTxt').innerHTML = e.message + '. <a href="#/maqueta">Abrir la versión ligera</a>.'; return; }
    Cs.Ion.defaultAccessToken = window.GI_CESIUM_TOKEN;
    viewer = new Cs.Viewer('muMapa', { terrain: Cs.Terrain.fromWorldTerrain(), baseLayerPicker: false, geocoder: false, homeButton: false, timeline: false, animation: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, selectionIndicator: false, infoBox: true,
      requestRenderMode: true, maximumRenderTimeChange: Infinity });  // redibuja solo cuando algo cambia: menos CPU y sin congelamientos
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.enableLighting = true;
    viewer.clock.currentTime = Cs.JulianDate.fromIso8601('2026-03-15T15:00:00Z');  // luz de media mañana en Barranquilla
    viewer.scene.fog.density = .00012;
    window.__mundo = viewer;  // para pruebas automáticas
    await ponerCiudad('google');
    capas();
    ponerModo('volar', true);
    irPaso(0);
    // dron y caminar: mientras haya teclas pulsadas se pide un cuadro por fotograma
    const bucle = () => { if (teclas.size && modo !== 'volar') { mover(); viewer.scene.requestRender(); } else ultimo = performance.now(); requestAnimationFrame(bucle); };
    requestAnimationFrame(bucle);
    $('muAnt').addEventListener('click', () => irPaso(paso - 1));
    $('muSig').addEventListener('click', () => irPaso(paso + 1));
    document.querySelectorAll('#muPuntos button').forEach((b, i) => b.addEventListener('click', () => irPaso(i)));
    document.querySelectorAll('#muModo button').forEach((b) => b.addEventListener('click', () => ponerModo(b.dataset.m)));
    document.querySelectorAll('#muCiudad button').forEach((b) => b.addEventListener('click', () => ponerCiudad(b.dataset.c)));
    document.querySelectorAll('.mu-capas input').forEach((i) => i.addEventListener('change', () => capa(i.dataset.k, i.checked)));
    addEventListener('keydown', (e) => {
      if ($('pgMundo').hidden || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (modo === 'volar') { if (e.key === 'ArrowRight') irPaso(paso + 1); if (e.key === 'ArrowLeft') irPaso(paso - 1); return; }
      teclas.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => teclas.delete(e.code));
  }

  window.GI_mundo = function () { if (!viewer) montar(); else viewer.resize(); };
})();
