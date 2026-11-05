/* Maqueta 3D de la propuesta de la tesis (#/maqueta): recorrido en 5 pasos sobre el relieve real.
 * Datos: capas de la tesis en data/capas (franja, unidades de paisaje, cauces de Strahler, UFP, nodos, corredores, macromanzanas).
 * Las UFP y los nodos son lineamientos; las macromanzanas, una propuesta; los usos 2035, escenarios hipotéticos. */
(function () {
  'use strict';
  const C = 'data/capas/';
  const ROJO = '#c0271d', ORO = '#f0c987';
  const VOCACION = {
    'Conservación y restauración ecológica': '#3f8f4f', 'Agroforestal de transición': '#9bbf5a', 'Agroindustrial': '#d9b44a',
    'Residencial mixta consolidada': '#c76b4a', 'Residencial mixta de expansión': '#e39a6f',
    'Reserva logística del corredor Circunvalar': '#7d6bb0', 'Logística y retroportuaria': '#4b5d8c'
  };
  const USO2035 = {
    'Protección ecológica': '#3f8f4f', 'Rural y natural': '#9bbf5a', 'Rural y natural sin regulación específica': '#c9c39a',
    'Agroindustrial y rural productivo': '#d9b44a', 'Residencial y mixto': '#d8784f', 'Logística e industria': '#5a5f9a'
  };
  const UFP = { 'UFP 1': '#8e44ad', 'UFP 2': '#d9332b', 'UFP 3': '#e6a817', 'UFP 4': '#2e9d4b' };
  const match = (campo, tabla, otro) => ['match', ['get', campo], ...Object.entries(tabla).flat(), otro];
  const leyendaDe = (tabla) => Object.entries(tabla).map(([k, c]) => ({ c, t: k }));

  const PASOS = [
    { tit: 'El territorio', cam: { center: [-74.865, 10.985], zoom: 10.6, pitch: 62, bearing: 200 },
      txt: 'Barranquilla entre el mar Caribe, el río Magdalena y la ciénaga de Mallorquín. El relieve real (Copernicus GLO-30) está exagerado 2,5 veces para que se lean los cerros del occidente, de donde baja el agua hacia la ciénaga.',
      capas: [], ley: [], fig: 'fig-3' },
    { tit: 'La franja de interfaz urbano-rural', cam: { center: [-74.88, 10.965], zoom: 11.1, pitch: 60, bearing: 195 },
      txt: 'El objeto de la tesis: 18.577 ha entre la ciudad construida y el campo, delimitadas por cuenca, es decir, por el suelo cuya agua escurre hacia la ciénaga y el mar. Es el territorio que el IOTF-IUR propone ordenar.',
      capas: ['franja'], ley: [{ c: ROJO, t: 'Franja de interfaz urbano-rural (18.577 ha)' }], fig: 'atlas-3-13' },
    { tit: 'Las unidades de paisaje', cam: { center: [-74.885, 10.955], zoom: 11.3, pitch: 58, bearing: 170 },
      txt: 'La franja se divide en cuatro unidades según hacia qué arroyo drena cada terreno: el agua es la protagonista. Las líneas azules son los cauces, más gruesas cuanto mayor es su orden de Strahler; casi la mitad de la red son cabeceras.',
      capas: ['unidades', 'cauces', 'franjaLinea'], ley: [], leyCampo: 'unidades', fig: 'atlas-3-25' },
    { tit: 'Los lineamientos: UFP, nodos y corredores', cam: { center: [-74.875, 10.97], zoom: 11.2, pitch: 55, bearing: 210 },
      txt: 'Sobre esa base, la tesis propone como lineamientos cuatro Unidades Funcionales de Planificación (UFP), seis nodos que articulan la franja y los corredores que la conectan con la ciudad y el puerto, con la Circunvalar de la Prosperidad como eje.',
      capas: ['ufp', 'corredores', 'circunvalar', 'nodos', 'franjaLinea'],
      ley: [...leyendaDe(UFP).map((x) => ({ c: x.c, t: x.t + ' (lineamiento)' })), { c: '#111', t: 'Corredores económicos' }, { c: '#5b2a86', t: 'Circunvalar de la Prosperidad' }, { c: ROJO, t: 'Nodos', punto: true }], fig: 'fig-70' },
    { tit: 'La propuesta: macromanzanas', cam: { center: [-74.865, 10.975], zoom: 12.2, pitch: 64, bearing: 220 },
      txt: 'La escala de gestión que propone la tesis: 367 macromanzanas que agrupan manzanas y predios, cada una con una vocación. La altura indica el porcentaje de suelo construido hoy (exagerada). Compare los dos escenarios hipotéticos para 2035.',
      capas: ['macro', 'franjaLinea'], ley: leyendaDe(VOCACION), fig: 'fig-76', modos: true }
  ];

  let mapa = null, paso = 0, modo = 'vocacion', listo = false;
  const $ = (id) => document.getElementById(id);
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function capas() {
    mapa.addSource('franja', { type: 'geojson', data: C + 'franja_interface_urbano_rural_amb_integrada.geojson' });
    mapa.addSource('unidades', { type: 'geojson', data: C + 'unidades_paisaje_subcuenca.geojson' });
    mapa.addSource('cauces', { type: 'geojson', data: C + 'maqueta_cauces_strahler.geojson' });
    mapa.addSource('ufp', { type: 'geojson', data: C + 'ufps.geojson' });
    mapa.addSource('corredores', { type: 'geojson', data: C + 'corredores_economicos.geojson' });
    mapa.addSource('circunvalar', { type: 'geojson', data: C + 'circunvalar_prosperidad.geojson' });
    mapa.addSource('nodos', { type: 'geojson', data: C + 'nodos.geojson' });
    mapa.addSource('macro', { type: 'geojson', data: C + 'maqueta_macromanzanas.geojson' });
    const L = (o) => mapa.addLayer({ ...o, layout: { ...(o.layout || {}), visibility: 'none' } });
    L({ id: 'franja', type: 'fill', source: 'franja', paint: { 'fill-color': ROJO, 'fill-opacity': .38 } });
    L({ id: 'franja-b', type: 'line', source: 'franja', paint: { 'line-color': ORO, 'line-width': 2.2 } });
    L({ id: 'franjaLinea', type: 'line', source: 'franja', paint: { 'line-color': ORO, 'line-width': 1.6, 'line-dasharray': [3, 2] } });
    L({ id: 'unidades', type: 'fill', source: 'unidades', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': .55 } });
    L({ id: 'cauces', type: 'line', source: 'cauces', paint: { 'line-color': '#7fd3ff', 'line-width': ['interpolate', ['linear'], ['get', 'orden'], 1, .6, 5, 4.2] } });
    L({ id: 'ufp', type: 'fill', source: 'ufp', paint: { 'fill-color': ['match', ['slice', ['get', 'Categoría'], 0, 5], ...Object.entries(UFP).flat(), '#888'], 'fill-opacity': .42, 'fill-outline-color': '#fff' } });
    L({ id: 'corredores', type: 'line', source: 'corredores', paint: { 'line-color': '#111', 'line-width': 2.4 } });
    L({ id: 'circunvalar', type: 'line', source: 'circunvalar', paint: { 'line-color': '#5b2a86', 'line-width': 3.4 } });
    L({ id: 'nodos', type: 'circle', source: 'nodos', paint: { 'circle-radius': 7, 'circle-color': ROJO, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    L({ id: 'nodos-t', type: 'symbol', source: 'nodos', layout: { 'text-field': ['get', 'NOMBRE'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
        paint: { 'text-color': '#fff', 'text-halo-color': '#12324f', 'text-halo-width': 1.6 } });
    L({ id: 'macro', type: 'fill-extrusion', source: 'macro', paint: {
      'fill-extrusion-color': match('vocacion_nombre', VOCACION, '#999'),
      'fill-extrusion-height': ['+', 10, ['*', 3, ['coalesce', ['get', 'pct_construido'], 0]]],  // 10 m + 3 m por cada % construido
      'fill-extrusion-opacity': .88 } });
    mapa.on('click', 'macro', (e) => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(
        `<strong>${p.id}</strong> · ${p.UFP.replace('_', ' ')}<br>${p.vocacion_nombre}<br>${Number(p.ha).toLocaleString('es-CO')} ha · ${Number(p.pct_construido).toLocaleString('es-CO')} % construido hoy` +
        `<br><small>2035 tendencial: ${p.uso_2035_tendencial}<br>2035 IOTF: ${p.uso_2035_iotf} (escenarios hipotéticos)</small>`).addTo(mapa);
    });
    mapa.on('mouseenter', 'macro', () => { mapa.getCanvas().style.cursor = 'pointer'; });
    mapa.on('mouseleave', 'macro', () => { mapa.getCanvas().style.cursor = ''; });
  }

  const VISIBLES = { franja: ['franja', 'franja-b'], unidades: ['unidades'], cauces: ['cauces'], franjaLinea: ['franjaLinea'], ufp: ['ufp'], corredores: ['corredores'],
    circunvalar: ['circunvalar'], nodos: ['nodos', 'nodos-t'], macro: ['macro'] };

  function pintarModo() {
    const campo = modo === 'vocacion' ? 'vocacion_nombre' : modo === 'tendencial' ? 'uso_2035_tendencial' : 'uso_2035_iotf';
    mapa.setPaintProperty('macro', 'fill-extrusion-color', match(campo, modo === 'vocacion' ? VOCACION : USO2035, '#999'));
    pintarLeyenda(modo === 'vocacion' ? leyendaDe(VOCACION) : leyendaDe(USO2035));
    document.querySelectorAll('#mqModos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === modo)));
  }

  function pintarLeyenda(items) {
    $('mqLey').innerHTML = items.map((x) => `<li><i style="background:${x.c}" class="${x.punto ? 'pt' : ''}"></i>${x.t}</li>`).join('');
  }

  function ir(n) {
    paso = Math.max(0, Math.min(PASOS.length - 1, n));
    const P = PASOS[paso];
    const on = new Set(P.capas.flatMap((k) => VISIBLES[k]));
    Object.values(VISIBLES).flat().forEach((id) => mapa.getLayer(id) && mapa.setLayoutProperty(id, 'visibility', on.has(id) ? 'visible' : 'none'));
    const movil = innerWidth <= 640;  // el panel tapa la izquierda en escritorio y el tercio inferior en móvil
    mapa.flyTo({ ...P.cam, padding: movil ? { bottom: innerHeight * .45, top: 0, left: 0, right: 0 } : { left: 400, top: 0, bottom: 0, right: 0 }, duration: quieto() ? 0 : 2600, essential: true });
    $('mqN').textContent = `${paso + 1} / ${PASOS.length}`;
    $('mqTit').textContent = P.tit;
    $('mqTxt').textContent = P.txt;
    $('mqFig').href = '#/' + P.fig;
    $('mqModos').hidden = !P.modos;
    if (P.leyCampo === 'unidades') {
      fetch(C + 'unidades_paisaje_subcuenca.geojson').then((r) => r.json()).then((d) => pintarLeyenda(
        d.features.map((f) => ({ c: f.properties.color, t: `${f.properties.unidad} (${f.properties.ha.toLocaleString('es-CO')} ha)` })).concat([{ c: '#7fd3ff', t: 'Cauces por orden de Strahler (1 a 5)' }])));
    } else if (P.modos) { modo = 'vocacion'; pintarModo(); } else pintarLeyenda(P.ley);
    document.querySelectorAll('#mqPuntos button').forEach((b, i) => b.setAttribute('aria-current', String(i === paso)));
    $('mqAnt').disabled = paso === 0;
    $('mqSig').disabled = paso === PASOS.length - 1;
  }

  function montar() {
    const pg = $('pgMaqueta');
    pg.innerHTML = `
      <div id="mqMapa" class="mq-mapa" role="region" aria-label="Maqueta 3D de la franja de interfaz urbano-rural"></div>
      <aside class="mq-panel" aria-live="polite">
        <div class="mq-cab"><span class="mq-eti">Maqueta 3D de la propuesta</span><span id="mqN" class="mq-n"></span></div>
        <h2 id="mqTit"></h2>
        <p id="mqTxt"></p>
        <div id="mqModos" class="mq-modos" role="group" aria-label="Qué colorear" hidden>
          <button data-m="vocacion">Vocación</button><button data-m="tendencial">2035 tendencial</button><button data-m="iotf">2035 con IOTF</button>
        </div>
        <ul id="mqLey" class="mq-ley"></ul>
        <div class="mq-pie">
          <div id="mqPuntos" class="mq-puntos">${PASOS.map((p, i) => `<button aria-label="Paso ${i + 1}: ${p.tit}"></button>`).join('')}</div>
          <a id="mqFig" class="mq-fig" href="#/">Ver la lámina de la tesis →</a>
          <a class="mq-fig" href="#/mundo">Recorrer en el mundo 3D (volar y caminar) →</a>
          <div class="mq-nav"><button id="mqAnt" class="btn">← Anterior</button><button id="mqSig" class="btn pri">Siguiente →</button></div>
        </div>
        <p class="mq-nota">Relieve exagerado 2,5×. UFP y nodos: lineamientos; macromanzanas: propuesta; usos 2035: escenarios hipotéticos. Imagen: Esri World Imagery.</p>
      </aside>`;
    mapa = new maplibregl.Map({
      container: 'mqMapa', attributionControl: { compact: true },
      style: { version: 8, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: { sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Esri, Maxar, Earthstar Geographics' },
          dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14 } },
        layers: [{ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.05 } }],
        sky: { 'sky-color': '#9cc3e4', 'horizon-color': '#e8eef4', 'fog-color': '#dfe7ee', 'sky-horizon-blend': .6, 'horizon-fog-blend': .5, 'fog-ground-blend': .55 } },
      ...PASOS[0].cam, maxPitch: 80
    });
    mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    mapa.on('load', () => {
      mapa.setTerrain({ source: 'dem', exaggeration: 2.5 });
      capas(); listo = true; ir(0);
    });
    $('mqAnt').addEventListener('click', () => ir(paso - 1));
    $('mqSig').addEventListener('click', () => ir(paso + 1));
    document.querySelectorAll('#mqPuntos button').forEach((b, i) => b.addEventListener('click', () => ir(i)));
    document.querySelectorAll('#mqModos button').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.m; pintarModo(); }));
    document.addEventListener('keydown', (e) => {
      if ($('pgMaqueta').hidden || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') ir(paso + 1);
      if (e.key === 'ArrowLeft') ir(paso - 1);
    });
  }

  // punto de entrada desde el enrutador de app.js
  window.GI_maqueta = function () {
    if (!mapa) montar();
    else { mapa.resize(); if (listo) ir(paso); }
  };
})();
