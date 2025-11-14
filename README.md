# COVID Globe — Visualización 3D

Pequeña demo en **Three.js** que muestra casos de COVID sobre un globo 3D con una línea de tiempo interactiva y un panel de **Top Países** actualizado en tiempo real.  
Incluye `InstancedMesh` para renderizar miles de puntos de manera eficiente.

**Vídeo de demostración:**  
[src/res/covid visualization.mkv](src/res/covid%20visualization.mkv)


##  Contenido del proyecto

- `src/index.js` — código principal (Three.js + lil-gui).
- `src/res/earth.png` — textura del planeta Tierra.
- `src/res/CV_LatLon_21Jan_12Mar.csv` — datos de COVID por fecha y coordenadas.
- `src/res/covid visualization.mkv` — vídeo demostrativo.

# Dataset utilizado:

  https://www.kaggle.com/datasets/grebublin/coronavirus-latlon-dataset
  
Es un dataset muy pequeñito (apenas 2 meses y poco) pero da para la demostración
