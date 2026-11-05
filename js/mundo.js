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
  const VOC = { 'Conservación y restauración ecológica': '#3f8f4f', 'Agroforestal de transición': '#9bbf5a', 'Agroindustrial': '#f2a93b', 'Residencial mixta consolidada': '#c0392b',
    'Residencial mixta de expansión': '#f9a3a3', 'Reserva logística del corredor Circunvalar': '#cdb4ea', 'Logística y retroportuaria': '#9b3fc0' };

  const PASOS = [
    { tit: 'El territorio', cam: [-74.99, 10.9, 15000, 70, -30], capas: [],
      txt: 'Barranquilla entre el mar Caribe, el río Magdalena y la ciénaga de Mallorquín. Al occidente, los cerros desde donde baja el agua hacia la ciénaga y el mar.' },
    { tit: 'La franja de interfaz urbano-rural', cam: [-74.885, 10.87, 10000, 350, -30], encuadre: [350, -38], capas: ['franja'],
      txt: 'El objeto de la tesis: 18.577 ha entre la ciudad construida y el campo, delimitadas por cuenca, es decir, por el suelo cuya agua escurre hacia la ciénaga y el mar.' },
    { tit: 'Las unidades de paisaje', cam: [-74.9, 10.885, 8500, 10, -34], encuadre: [10, -42], capas: ['franja', 'unidades'],
      txt: 'Cuatro unidades según hacia qué arroyo drena cada terreno: el agua es la protagonista. Las líneas azules son los cauces, más gruesas cuanto mayor es su orden de Strahler.' },
    { tit: 'Los lineamientos: UFP, nodos y corredores', cam: [-74.885, 10.80, 23000, 0, -52], encuadre: [0, -55], capas: ['franja', 'ufp'],
      txt: 'La tesis propone como lineamientos cuatro Unidades Funcionales de Planificación (UFP), los nodos que articulan la franja y los corredores que la conectan, con la Circunvalar de la Prosperidad como eje.' },
    { tit: 'La propuesta: macromanzanas', cam: [-74.875, 10.925, 3800, 330, -28], capas: ['franja', 'macro'],
      txt: '367 macromanzanas (18.537 ha, ajustadas a las UFP 1 a 3; la UFP 4 de protección no se divide) que agrupan manzanas y predios, cada una pintada con su vocación sobre el terreno real. Toque una para ver su superficie, lo construido hoy y sus escenarios 2035 (hipotéticos).' }
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
    const mm = await geo('maqueta_macromanzanas.geojson');  // apoyadas: se pintan sobre el terreno y sobre la malla 3D de la ciudad
    mm.entities.values.forEach((e) => {
      if (!e.polygon) return;
      const p = e.properties;
      e.polygon.material = color(VOC[p.vocacion_nombre.getValue()] || '#999', .62);
      e.polygon.outline = false;
      e.polygon.classificationType = Cs.ClassificationType.BOTH;
      e.name = p.id.getValue();  // título de la ficha
      e.description = `<p><b>${p.id.getValue()}</b> · ${p.UFP.getValue().replace('_', ' ')}<br>${p.vocacion_nombre.getValue()}<br>${Number(p.ha.getValue()).toLocaleString('es-CO')} ha · ${p.pct_construido.getValue()} % construido hoy<br>` +
        `2035 tendencial: ${p.uso_2035_tendencial.getValue()}<br>2035 IOTF: ${p.uso_2035_iotf.getValue()} (escenarios hipotéticos)</p>`;
    });
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

  // Ortoimagen IGAC 2026 del Atlántico (3 m), servida por WMS con CORS abierto; se pinta sobre el terreno real
  let orto = null;
  function capaOrto() {
    if (orto) return orto;
    orto = viewer.imageryLayers.addImageryProvider(new Cs.WebMapServiceImageryProvider({
      url: 'https://mapas2.igac.gov.co/image2/services/orto/orto08atlantico8b2026/ImageServer/WMSServer',
      layers: 'orto08atlantico8b2026:Truecolor', parameters: { format: 'image/png', transparent: true, version: '1.1.1' },
      rectangle: Cs.Rectangle.fromDegrees(-75.32, 10.25, -74.70, 11.12),  // extensión del mosaico del Atlántico
      tileWidth: 512, tileHeight: 512, minimumLevel: 0, maximumLevel: 18,
      credit: 'Ortoimagen: IGAC, Atlántico 2026' }));
    orto.contrast = 1.18; orto.saturation = 1.12; orto.brightness = .97; orto.gamma = 1.05;  // el mosaico original sale apagado
    return orto;
  }
  async function ponerCiudad(tipo) {
    if (ciudad) { viewer.scene.primitives.remove(ciudad); ciudad = null; }
    viewer.scene.globe.show = true;
    capaOrto().show = tipo !== 'google';  // con Google 3D, su propia malla fotorrealista sustituye a la ortoimagen
    if (tipo === 'igac') {
      aviso('Ortofoto IGAC 2026 (3 m) sobre el relieve real. Acérquese para ver el detalle de predios, vías y cauces.');
      document.querySelectorAll('#muCiudad button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === tipo)));
      viewer.scene.requestRender();
      return;
    }
    try {
      ciudad = tipo === 'google' ? await Cs.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true, maximumScreenSpaceError: 24 }) : await Cs.createOsmBuildingsAsync();
      viewer.scene.primitives.add(ciudad);
      if (tipo === 'google') viewer.scene.globe.show = false;  // la malla de Google ya trae el terreno
    } catch (e) {
      console.warn('Ciudad 3D no disponible:', e.message);
      if (tipo === 'google') { aviso('Google 3D no está disponible ahora; se muestran los edificios de OpenStreetMap.'); return ponerCiudad('osm'); }
    }
    aviso(tipo === 'google' ? 'Ciudad: Google 3D. Acérquese a menos de 1 km para ver edificios y árboles en volumen.' : 'Ciudad: edificios de OpenStreetMap (volúmenes simplificados).');
    document.querySelectorAll('#muCiudad button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === tipo)));
  }

  const aviso = (t) => { const a = $('muCiudadEstado'); if (a) a.textContent = t; };
  const ir = (c, dur = 2.8) => viewer.camera.flyTo({ destination: Cs.Cartesian3.fromDegrees(c[0], c[1], c[2]), orientation: { heading: Cs.Math.toRadians(c[3]), pitch: Cs.Math.toRadians(c[4]), roll: 0 },
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : dur });

  function franjaDatos() { for (let i = 0; i < viewer.dataSources.length; i++) { const d = viewer.dataSources.get(i); if (d.name === 'franja') return d; } return null; }
  function irPaso(n) {
    paso = Math.max(0, Math.min(PASOS.length - 1, n));
    if (viewer) viewer.selectedEntity = undefined;  // cierra la ficha abierta
    const P = PASOS[paso];
    if (modo !== 'volar') ponerModo('volar', true);
    marcarCapas(P.capas);
    // pasos con encuadre: la cámara abarca la franja completa con ese rumbo e inclinación (rango calculado por Cesium)
    const fr = P.encuadre && franjaDatos();
    if (fr) viewer.flyTo(fr, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2.8,
      offset: new Cs.HeadingPitchRange(Cs.Math.toRadians(P.encuadre[0]), Cs.Math.toRadians(P.encuadre[1]), 0) });
    else ir(P.cam);
    $('muN').textContent = `${paso + 1} / ${PASOS.length}`; $('muTit').textContent = P.tit; $('muTxt').textContent = P.txt;
    document.querySelectorAll('#muPuntos button').forEach((b, i) => b.setAttribute('aria-current', String(i === paso)));
    $('muAnt').disabled = paso === 0; $('muSig').disabled = paso === PASOS.length - 1;
    leyenda(P.capas);
  }
  const UNIDADES = [['Vertiente directa de la ciénaga', '#3f93bd'], ['Arroyo Sierra Palma', '#c9673f'], ['Arroyo Grande', '#d9a441'], ['Cabeceras del sur', '#6f9c57']];
  function leyenda(lista) {
    const it = [];
    if (lista.includes('franja')) it.push(['#c0271d', 'Franja de interfaz urbano-rural (18.577 ha)']);
    if (lista.includes('unidades')) it.push(...UNIDADES.map(([t, c]) => [c, t]), ['#7fd3ff', 'Cauces (más gruesos: mayor orden de Strahler)']);
    if (lista.includes('ufp')) it.push(...Object.entries(UFP).map(([k, c]) => [c, k + ' (lineamiento)']), ['#111111', 'Corredores económicos'], ['#5b2a86', 'Circunvalar de la Prosperidad'], ['#c0271d', 'Nodos', true]);
    if (lista.includes('macro')) it.push(...Object.entries(VOC).map(([t, c]) => [c, t]));
    $('muLey').innerHTML = it.map(([c, t, pt]) => `<li><i style="background:${c}" class="${pt ? 'pt' : ''}"></i>${t}</li>`).join('');
  }

  // --- dron y caminar: la cámara sigue el terreno a una altura fija; W A S D / flechas mueven, ratón mira
  const teclas = new Set();
  let ultimo = performance.now();
  function mover() {
    const t = performance.now(), dt = Math.min(.1, (t - ultimo) / 1000); ultimo = t;
    if (modo === 'volar') return;
    const cam = viewer.camera, rapido = teclas.has('ShiftLeft') || teclas.has('ShiftRight');
    const v = (modo === 'dron' ? (rapido ? 160 : 45) : (rapido ? 60 : 15)) * dt;  // m/s
    // el avance va en la dirección de la mirada pero en horizontal, para no hundirse ni despegar al mirar abajo o arriba
    const adelante = Cs.Cartesian3.normalize(Cs.Cartesian3.cross(cam.right, Cs.Ellipsoid.WGS84.geodeticSurfaceNormal(cam.position, new Cs.Cartesian3()), new Cs.Cartesian3()), new Cs.Cartesian3());
    const paso = (dir, d) => cam.move(dir, d);
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) paso(adelante, -v);
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) paso(adelante, v);
    if (teclas.has('KeyA')) cam.moveLeft(v);
    if (teclas.has('KeyD')) cam.moveRight(v);
    let rumbo = cam.heading;  // ← → giran la vista
    if (teclas.has('ArrowLeft')) rumbo -= 1.2 * dt;
    if (teclas.has('ArrowRight')) rumbo += 1.2 * dt;
    if (modo === 'dron' && teclas.has('KeyE')) dronAlt = Math.min(400, dronAlt + 40 * dt);
    if (modo === 'dron' && teclas.has('KeyQ')) dronAlt = Math.max(12, dronAlt - 40 * dt);
    const c = Cs.Cartographic.fromCartesian(cam.position);
    const suelo = viewer.scene.globe.show ? viewer.scene.globe.getHeight(c) : viewer.scene.sampleHeight(c, [], 1);
    if (suelo !== undefined) cam.setView({ destination: Cs.Cartesian3.fromRadians(c.longitude, c.latitude, suelo + (modo === 'dron' ? dronAlt : 1.7)), orientation: { heading: rumbo, pitch: cam.pitch, roll: 0 } });
  }
  function ponerModo(m, silencio) {
    modo = m;
    if (viewer) viewer.selectedEntity = undefined;  // cierra la ficha abierta
    const ctl = viewer.scene.screenSpaceCameraController, libre = m === 'volar';
    ctl.enableTranslate = ctl.enableZoom = ctl.enableTilt = ctl.enableRotate = libre;
    ctl.enableLook = true;
    // en dron y a pie, arrastrar mira alrededor (sin tener que sostener Mayús, que aquí acelera)
    ctl.enableLook = libre;  // en dron y a pie la mirada la lleva arrastrar() con sentido natural
    // la distancia mínima al suelo (80 m) es solo para volar; en dron y a pie la altura la fija mover()
    ctl.minimumZoomDistance = libre ? 80 : 1;
    ctl.enableCollisionDetection = libre;
    // a baja altura los volúmenes de las macromanzanas tapan la vista: se ocultan
    if (!libre) { capa('macro', false); const i = $('pgMundo').querySelector('[data-k="macro"]'); if (i) i.checked = false; }
    if (!silencio && !libre) {
      const lon = -74.905, lat = 10.965, h = (viewer.scene.globe.getHeight(Cs.Cartographic.fromDegrees(lon, lat)) || 40) + (m === 'dron' ? dronAlt : 1.7);
      viewer.camera.flyTo({ destination: Cs.Cartesian3.fromDegrees(lon, lat, h), orientation: { heading: Cs.Math.toRadians(20), pitch: Cs.Math.toRadians(m === 'dron' ? -15 : -4), roll: 0 }, duration: 2.5 });
    }
    document.querySelectorAll('#muModo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    $('muAyuda').textContent = { volar: 'Arrastre para girar, rueda para acercarse, Ctrl + arrastrar para inclinar.',
      dron: 'Dron a ' + Math.round(dronAlt) + ' m · arrastre para mirar · ← → girar · W S o ↑ ↓ avanzar · A D de lado · Q E bajar o subir · Mayús rápido.',
      caminar: 'A pie (1,7 m) · arrastre para mirar · ← → girar · W S o ↑ ↓ avanzar · A D de lado · Mayús correr.' }[m];
  }

  async function montar() {
    const pg = $('pgMundo');
    pg.innerHTML = `
      <div id="muMapa" class="mq-mapa"></div>
      <aside class="mq-panel mu-panel" aria-live="polite">
        <div class="mq-cab"><span class="mq-eti">Mundo 3D de la propuesta</span><span id="muN" class="mq-n"></span><button class="mq-plegar" aria-expanded="true" aria-label="Plegar el panel">▾</button></div>
        <h2 id="muTit">Cargando el mundo 3D…</h2>
        <p id="muTxt" class="mu-txt">Terreno, ciudad y capas de la tesis.</p>
        <div class="mq-pie">
          <ul id="muLey" class="mq-ley"></ul>
          <div id="muPuntos" class="mq-puntos">${PASOS.map((p, i) => `<button aria-label="Paso ${i + 1}: ${p.tit}"></button>`).join('')}</div>
          <div class="mq-nav"><button id="muAnt" class="btn">← Anterior</button><button id="muSig" class="btn pri">Siguiente →</button></div>
        </div>
        <details class="mu-libre"><summary>Explorar libremente</summary>
          <div class="mu-grupo"><span>Recorrer</span><div id="muModo" class="mq-modos"><button data-m="volar" aria-pressed="true">Volar</button><button data-m="dron">Dron</button><button data-m="caminar">Caminar</button></div></div>
          <div class="mu-grupo"><span>Ciudad</span><div id="muCiudad" class="mq-modos"><button data-c="igac">Ortofoto IGAC 2026</button><button data-c="google">Google 3D</button><button data-c="osm">Edificios OSM</button></div><p id="muCiudadEstado" class="mq-nota" role="status"></p></div>
          <div class="mu-grupo"><span>Capas</span><div class="mu-capas">
            <label><input type="checkbox" data-k="franja"> Franja de interfaz (18.577 ha)</label>
            <label><input type="checkbox" data-k="unidades"> Unidades de paisaje y cauces</label>
            <label><input type="checkbox" data-k="ufp"> Lineamientos: UFP, nodos y corredores</label>
            <label><input type="checkbox" data-k="macro"> Macromanzanas (propuesta)</label></div></div>
          <p id="muAyuda" class="mq-nota"></p>
        </details>
        <p class="mq-nota mu-pie-nota"><a href="#/maqueta">Versión ligera</a> · Terreno: Cesium World Terrain. Imagen: ortofoto IGAC 2026 (o Google 3D / OpenStreetMap). UFP y nodos: lineamientos; macromanzanas: propuesta; 2035: escenarios hipotéticos.</p>
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
    const ctl = viewer.scene.screenSpaceCameraController;
    ctl.minimumZoomDistance = 80; ctl.maximumZoomDistance = 60000;
    // sin terreno de Cesium (modo Google) la cámara no detecta el suelo: se impide que baje de 80 m o mire hacia arriba al volar
    viewer.scene.postRender.addEventListener(() => {
      if (modo !== 'volar' || !viewer.camera) return;
      const cam = viewer.camera, c = Cs.Cartographic.fromCartesian(cam.position);
      const suelo = viewer.scene.globe.show ? viewer.scene.globe.getHeight(c) : viewer.scene.sampleHeight(c, [], 1);
      const bajo = suelo !== undefined && c.height < suelo + 80, arriba = cam.pitch > Cs.Math.toRadians(-10);
      if (bajo || arriba) cam.setView({ destination: Cs.Cartesian3.fromRadians(c.longitude, c.latitude, bajo ? suelo + 80 : c.height),
        orientation: { heading: cam.heading, pitch: Math.min(cam.pitch, Cs.Math.toRadians(-10)), roll: 0 } });
    });
    window.__mundo = viewer;  // para pruebas automáticas
    await ponerCiudad('igac');  // por defecto la ortoimagen procesada de la tesis
    capas();
    ponerModo('volar', true);
    irPaso(0);
    // arrastrar para mirar en dron y a pie: derecha gira a la derecha, arriba mira arriba (0,25°/px y 0,2°/px)
    let arr = null;
    const lienzo = viewer.canvas;
    lienzo.addEventListener('pointerdown', (e) => { if (modo !== 'volar') { arr = { x: e.clientX, y: e.clientY }; lienzo.setPointerCapture(e.pointerId); } });
    lienzo.addEventListener('pointermove', (e) => {
      if (!arr || modo === 'volar') return;
      const cam = viewer.camera, dx = e.clientX - arr.x, dy = e.clientY - arr.y; arr = { x: e.clientX, y: e.clientY };
      const cab = Math.max(Cs.Math.toRadians(-80), Math.min(Cs.Math.toRadians(35), cam.pitch - Cs.Math.toRadians(dy * .2)));
      cam.setView({ orientation: { heading: cam.heading + Cs.Math.toRadians(dx * .25), pitch: cab, roll: 0 } });
      viewer.scene.requestRender();
    });
    const suelta = () => { arr = null; };
    lienzo.addEventListener('pointerup', suelta); lienzo.addEventListener('pointercancel', suelta);
    // plegar el panel
    const pl = pg.querySelector('.mq-plegar');
    pl.addEventListener('click', () => { const p = pg.querySelector('.mq-panel'); const ok = p.classList.toggle('plegado'); pl.setAttribute('aria-expanded', String(!ok)); pl.textContent = ok ? '▸' : '▾'; });
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
