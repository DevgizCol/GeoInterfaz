# GeoInterfaz · Geovisor de la Tesis Doctoral

> **"Enfoques y metodologías de planificación territorial local para el desarrollo de franjas de interfaz rural-urbanas limítrofes en ciudades portuarias"**  
> *Barranquilla, ciudad puerto y ciudad río*

Plataforma cartográfica interactiva y catálogo de datos espaciales desarrollada como soporte tecnológico y metodológico de la investigación doctoral.

- **Doctoranda:** Aida del Carmen Palmett Padilla
- **Dirección de tesis:** Dr. Miguel Yury Mayorga Cárdenas · Dr. Julián Galindo
- **Programa:** Doctorado en Sostenibilidad — Institut de Sostenibilitat
- **Institución:** Universitat Politècnica de Catalunya (UPC)
- **Año:** 2026

---

## 🌐 Características del Geovisor

1. **Mapas Interactivos (MapLibre GL JS):**
   - 41 vistas cartográficas interactivas con encuadre, simbología y jerarquía visual extraídas directamente de los proyectos oficiales de QGIS.
   - Soporte para tramas complejas, símbolos puntuales y rotulación con halo.
   - Conmutador de mapas base: OpenStreetMap, Satélite (Esri World Imagery), Carto Positron y Sin Fondo.
   - Despliegue de coordenadas en tiempo real tanto en **WGS84** como en el sistema de coordenadas oficial colombiano **MAGNA-SIRGAS 2018 / Origen Nacional (EPSG:9377)**.

2. **Tabla de Atributos Espaciales:**
   - Cajón deslizable con visualización alfanumérica completa de cada capa.
   - Búsqueda y filtrado instantáneo por texto y valores numéricos.
   - Enfoque espacial dinámico (*zoom to feature*) al hacer clic sobre cualquier registro.
   - Descarga directa en formato estándar GeoJSON.

3. **Visor de Láminas de Atlas en Alta Resolución (Zoomer):**
   - 34 láminas finales del atlas cartográfico en formato horizontal 300 DPI.
   - Control fluido de desplazamiento (*pan*) y ampliación (*zoom*) con rueda del ratón y gestos táctiles.

4. **Visor de Tablas del Manuscrito y Gráficos:**
   - Tablas de encuestas ($n=707$) estructuradas semánticamente en HTML.
   - Enlace bidireccional entre tablas de frecuencias y sus correspondientes gráficos de percepción y conectividad.

5. **Permalinks y Códigos QR para Citación en la Tesis:**
   - Cada figura, mapa, tabla o lámina posee un identificador único (ej: `#/fig-3`, `#/atlas-3-8`, `#/tabla-74`).
   - Modal interactivo con enlace permanente, código QR y texto sugerido para la nota a pie de página del manuscrito.

---

## 📂 Estructura del Proyecto

```text
├── index.html            # Estructura principal de la aplicación web
├── logo_upc.png          # Escudo oficial de la UPC
├── css/
│   └── estilo.css        # Sistema de diseño y hojas de estilo
├── js/
│   └── app.js            # Lógica de la aplicación, enrutador y motor MapLibre
└── data/
    ├── catalogo.json     # Metadatos de los 164 elementos del manuscrito
    ├── vistas.json       # Definición de encuadres, capas y estilos de QGIS
    ├── capas.json        # Metadatos técnicos de las 96 capas SIG
    ├── capas/            # 96 archivos GeoJSON simplificados en EPSG:4326
    ├── laminas/          # Láminas del atlas en alta resolución y miniaturas
    ├── figuras/          # Gráficos de figuras extraídos del manuscrito
    └── tablas/           # Tablas HTML del manuscrito
```

---

## 🚀 Despliegue en GitHub Pages

Este repositorio está configurado para ejecutarse directamente como sitio estático sin requerir compilación:
1. Activar GitHub Pages desde **Settings > Pages**.
2. Seleccionar la rama `main` y la carpeta `/ (root)`.
3. El sitio quedará disponible públicamente en la URL de GitHub Pages de la organización `DevGizCol`.
