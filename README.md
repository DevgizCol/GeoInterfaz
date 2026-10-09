# GeoInterfaz · Geovisor de la tesis doctoral

**Enfoques y metodologías de planificación territorial local para el desarrollo de franjas de interfaz rural-urbanas limítrofes en ciudades portuarias. Barranquilla, ciudad puerto y ciudad río**

- Doctoranda: Aida del Carmen Palmett Padilla
- Dirección: Dr. Miguel Yury Mayorga Cárdenas · Dr. Julián Galindo
- Doctorado en Sostenibilidad · Universitat Politècnica de Catalunya (UPC)
- Sitio: <https://geointerfaz.vercel.app/>

## Qué es

Un sitio estático que reúne los 164 elementos numerados de la tesis (figuras, tablas, esquemas y láminas del atlas) con su número, título y nota. Los mapas se dibujan con las mismas capas, simbología y encuadre de las composiciones de QGIS y pueden compararse con la lámina impresa.

El sitio no añade contenido propio: todo lo que muestra sale del manuscrito y de los proyectos QGIS de la investigación.

## Qué ofrece

- **Índice por capítulos**, con filtro por tipo y buscador global (`Ctrl+K`).
- **Mapa interactivo**: leyenda, capas con interruptor y opacidad, tabla de atributos, rótulos, medición, perspectiva, encuadres de la tesis y captura de imagen.
- **Lámina** del atlas en alta resolución con zoom, y **tablas** del manuscrito.
- **Ficha** de cada elemento: nota y fuente, ubicación en la tesis, proyecto y composición de QGIS, archivo de la lámina.
- **Citar**: enlace permanente y código QR de cada vista (`#/fig-3`, `#/atlas-3-8`, `#/tabla-12`…).
- Navegación con anterior y siguiente (`Mayús+←` y `Mayús+→`).
- **Comparar**: mapa interactivo y lámina impresa lado a lado.
- **Presentar** (`P`): pantalla completa sin menús, para exponer pasando con las flechas.
- Tema claro y oscuro, transparencia general de la cartografía, resaltado del elemento bajo el cursor y filtro dentro de las tablas.
- Se adapta a teléfono, tableta y pantallas grandes (verificado de 390 a 1920 px de ancho).

## Estructura

```text
index.html        Estructura de la página
css/estilo.css    Estilos base
css/refinado.css  Tipografía, tema oscuro, presentación y adaptación a cada pantalla
js/app.js         Aplicación (enrutador, mapa, panel, ficha)
data/
  catalogo.json   Los 164 elementos del manuscrito
  vistas.json     Encuadre, capas y estilos de cada composición de QGIS
  capas.json      Ficha técnica de las 96 capas
  capas/          Capas en GeoJSON (EPSG:4326)
  laminas/        Láminas del atlas para web
  figuras/        Figuras extraídas del manuscrito
  tablas/         Tablas del manuscrito en HTML
```

La carpeta `data/` no se edita a mano. Se genera con los programas de `05_GEOVISOR/construir/` del repositorio de la tesis (`01_capas.py`, `02_tesis.py`, `03_catalogo.py`, `04_enlaces.py`).

## Ver en local

```bash
python -m http.server 8765
```

y abrir <http://localhost:8765/>.

## Publicación

El sitio se publica en Vercel desde este repositorio, sin paso de compilación (`vercel.json`). Cada envío a la rama principal actualiza la dirección pública.

## Créditos

MapLibre GL JS · Turf · Proj4js · qrcode-generator. Fondos: Esri (gris claro, gris oscuro, imagen satelital) y OpenStreetMap. Las fuentes de cada capa se indican en la nota de su mapa.
