import geopandas as gpd
import json, os

RAIZ = '/home/danielg21/Documentos/DanielG/2026/DevGiz/Tesis/AIDA/'
SHP = RAIZ + '02_SISTEMA_INFORMACION_GEOGRAFICA_SIG/02_Capas_Vectoriales_AMB/SHPs/'
OUT = RAIZ + '05_GEOVISOR/sitio/capillary_edge/data/'
os.makedirs(OUT, exist_ok=True)

capas = {
    'franja': 'CENTROIDE_INTERFACE.shp',
    'arroyos': 'DRENAJES_SENCILLOS_AMB.shp',
    'circunvalar': 'Autopista Circunvalar de la Prosperidad.shp',
    'planes_parciales': 'DESARROLLOS_INMOBILIARIOS.shp',
    'informal': 'BARRIOS_LIMITE_ZONA_URBANA.shp',
    'aptitud': 'APTITUD_SUELO_RURAL_IGAC.shp'
}

for k, v in capas.items():
    shp_path = os.path.join(SHP, v)
    if os.path.exists(shp_path):
        try:
            gdf = gpd.read_file(shp_path)
            # Convertir a WGS84 para Leaflet / MapLibre (EPSG:4326)
            gdf_4326 = gdf.to_crs(epsg=4326)
            # Simplificar levemente si tiene demasiados vertices
            if len(gdf_4326) > 500:
                gdf_4326['geometry'] = gdf_4326['geometry'].simplify(0.0005, preserve_topology=True)
            out_file = os.path.join(OUT, f'{k}.geojson')
            gdf_4326.to_file(out_file, driver='GeoJSON')
            print(f'Exportado {k}: {len(gdf_4326)} elementos -> {out_file}')
        except Exception as e:
            print(f'Error exportando {k}: {e}')
    else:
        print(f'No existe: {shp_path}')

