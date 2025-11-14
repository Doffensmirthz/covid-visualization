/*
  posibles datasets:
  terremotos en indonesia con lat lon
  https://www.kaggle.com/datasets/kekavigi/earthquakes-in-indonesia/data

  accidentes de aviones con lat lon
  https://www.kaggle.com/datasets/cgurkan/airplane-crash-data-since-1908
  https://www.kaggle.com/datasets/dianaddx/aircraft-wildlife-strikes-1990-2023

  coronavirus
  https://www.kaggle.com/datasets/grebublin/coronavirus-latlon-dataset

  world coordinates
  https://www.kaggle.com/datasets/parulpandey/world-coordinates
*/
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import GUI from "lil-gui";

let scene, camera, renderer, camcontrols;
let earthGroup, earth, loader, earthTexture;
let instancedDots,
  tempObject = new THREE.Object3D();

let dates = [];
let dateIndexMap = new Map();
let rawValuesByDate = [];
let cumulativeByDate = [];
let dailyByDate = [];
let locKeyToIndex = new Map();
let locations = [];

let currentDateIndex = 0;
let playInterval = null;
let instancedCount = 0;

const settings = {
  dateIndex: 0,
  playing: false,
  speedMs: 400,
  cumulative: false,
  baseDotSize: 0.005,
  topN: 10,
  dateLabel: "",
  resetView() {
    camera.position.set(0, 0, 6);
    camcontrols.update();
  },
};

let topPanelDom = null;

let gui, dateController;

function init() {
  initRenderer();
  initCamControl();
  initEarth3d();
  createTopPanelDom();
  loadCSV();
  animate();
}

function initRenderer() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
  document.body.appendChild(renderer.domElement);

  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
}

function initCamControl() {
  camcontrols = new OrbitControls(camera, renderer.domElement);
  camcontrols.minDistance = 3;
  camcontrols.maxDistance = 30;
}

function initEarth3d() {
  loader = new THREE.TextureLoader();
  earthTexture = loader.load("src/res/earth.png");

  earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const geo = new THREE.SphereGeometry(1.5, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ map: earthTexture });
  earth = new THREE.Mesh(geo, mat);
  earthGroup.add(earth);
}

function parseCsvDate(str) {
  if (!str) return null;
  var parts = str.split("/").map(Number);
  if (parts.length < 3) return null;
  var m = parts[0],
    d = parts[1],
    y = parts[2];
  if (y < 100) y = 2000 + y;
  return new Date(y, m - 1, d);
}

function latLonToVector3(lat, lon, r) {
  if (r === undefined) r = 1.5;
  var phi = ((90 - lat) * Math.PI) / 180;
  var theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

async function loadCSV() {
  var res = await fetch("src/res/CV_LatLon_21Jan_12Mar.csv");
  var csv = await res.text();
  var lines = csv
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return l.length > 0;
    });

  var records = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split(",");
    if (cols.length < 7) continue;
    var country = cols[2];
    var lat = parseFloat(cols[3]);
    var lon = parseFloat(cols[4]);
    var date = parseCsvDate(cols[5]);
    var confirmed = parseInt(cols[6]) || 0;
    if (!date || isNaN(lat) || isNaN(lon)) continue;

    records.push({
      country: country,
      lat: lat,
      lon: lon,
      confirmed: confirmed,
      dateTs: date.getTime(),
    });
  }

  var dateSet = new Set(
    records.map(function (r) {
      return r.dateTs;
    })
  );
  dates = Array.from(dateSet).sort(function (a, b) {
    return a - b;
  });
  dates.forEach(function (d, i) {
    dateIndexMap.set(d, i);
  });

  rawValuesByDate = dates.map(function () {
    return new Map();
  });

  function locKey(lat, lon) {
    return lat.toFixed(4) + "," + lon.toFixed(4);
  }

  for (var rIdx = 0; rIdx < records.length; rIdx++) {
    var r = records[rIdx];
    var di = dateIndexMap.get(r.dateTs);
    var key = locKey(r.lat, r.lon);
    var map = rawValuesByDate[di];
    map.set(key, (map.get(key) || 0) + r.confirmed);

    if (!locKeyToIndex.has(key)) {
      var pos = latLonToVector3(r.lat, r.lon);
      var idx = locations.length;
      locKeyToIndex.set(key, idx);
      locations.push({
        lat: r.lat,
        lon: r.lon,
        pos: pos,
        country: r.country,
      });
    }
  }

  buildCumulativeAndDaily();

  prepareInstancedMesh();

  initGUI();

  currentDateIndex = 0;
  settings.dateIndex = 0;
  updateForDate(currentDateIndex);
  updateTopCountriesFromCurrent();
  updateGuiDateControllerValue(0);
}

function buildCumulativeAndDaily() {
  cumulativeByDate = dates.map(function () {
    return new Map();
  });
  dailyByDate = dates.map(function () {
    return new Map();
  });

  var allKeys = Array.from(locKeyToIndex.keys());
  for (var k = 0; k < allKeys.length; k++) {
    var key = allKeys[k];
    var prevCum = 0;
    for (var d = 0; d < dates.length; d++) {
      var rawMap = rawValuesByDate[d];
      var reported = rawMap.has(key) ? rawMap.get(key) : undefined;

      var cum;
      if (reported === undefined) {
        cum = prevCum;
      } else {
        cum = reported;
      }

      cumulativeByDate[d].set(key, cum);

      var daily = cum - prevCum;
      if (daily < 0) daily = 0;
      dailyByDate[d].set(key, daily);

      prevCum = cum;
    }
  }
}

function prepareInstancedMesh() {
  if (instancedDots) {
    earthGroup.remove(instancedDots);
    if (instancedDots.dispose) instancedDots.dispose();
  }

  instancedCount = locations.length;
  var geo = new THREE.SphereGeometry(1, 8, 8);
  var mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

  instancedDots = new THREE.InstancedMesh(geo, mat, instancedCount);
  instancedDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  earthGroup.add(instancedDots);

  for (var i = 0; i < instancedCount; i++) {
    tempObject.position.copy(locations[i].pos);
    tempObject.scale.setScalar(0.000001);
    tempObject.updateMatrix();
    instancedDots.setMatrixAt(i, tempObject.matrix);
  }
  instancedDots.instanceMatrix.needsUpdate = true;
}

function updateForDate(index) {
  if (dates.length === 0) return;

  currentDateIndex = Math.max(0, Math.min(index, dates.length - 1));
  settings.dateIndex = currentDateIndex;

  var mapToUse = settings.cumulative
    ? cumulativeByDate[currentDateIndex]
    : dailyByDate[currentDateIndex];

  var values = new Float32Array(instancedCount);
  mapToUse.forEach(function (v, key) {
    var i = locKeyToIndex.get(key);
    if (i !== undefined) values[i] = v;
  });

  for (var i = 0; i < instancedCount; i++) {
    var val = values[i];
    var scale = val > 0 ? Math.cbrt(val + 1) * settings.baseDotSize : 0.000001;
    tempObject.position.copy(locations[i].pos);
    tempObject.scale.setScalar(scale);
    tempObject.updateMatrix();
    instancedDots.setMatrixAt(i, tempObject.matrix);
  }
  instancedDots.instanceMatrix.needsUpdate = true;

  var stats = computeCountryStats(values);
  updateTopCountries(stats);

  updateGuiDateControllerValue(currentDateIndex);
}

function computeCountryStats(vals) {
  var stats = new Map();
  for (var i = 0; i < locations.length; i++) {
    var v = vals[i];
    if (v <= 0) continue;
    var c = locations[i].country || "Unknown";
    stats.set(c, (stats.get(c) || 0) + v);
  }
  return stats;
}

function createTopPanelDom() {
  topPanelDom = document.createElement("div");
  topPanelDom.style.position = "absolute";
  topPanelDom.style.top = "10px";
  topPanelDom.style.left = "10px";
  topPanelDom.style.width = "260px";
  topPanelDom.style.padding = "10px";
  topPanelDom.style.background = "rgba(0, 0, 0, 0.65)";
  topPanelDom.style.color = "#fff";
  topPanelDom.style.fontFamily = "sans-serif";
  topPanelDom.style.fontSize = "13px";
  topPanelDom.style.borderRadius = "8px";
  topPanelDom.style.maxHeight = "70vh";
  topPanelDom.style.overflowY = "auto";
  topPanelDom.style.zIndex = 40;
  topPanelDom.style.boxShadow = "0 6px 18px rgba(0,0,0,0.5)";
  document.body.appendChild(topPanelDom);
}

function updateTopCountries(statsMap) {
  var arr = Array.from(statsMap.entries());
  arr.sort(function (a, b) {
    return b[1] - a[1];
  });
  var topN = arr.slice(0, Math.min(settings.topN, arr.length));

  var html = "<b>Top Países</b><br><br>";
  if (topN.length === 0) html += "Sin datos";
  for (var i = 0; i < topN.length; i++) {
    html += i + 1 + ". " + topN[i][0] + ": <b>" + topN[i][1] + "</b><br>";
  }
  topPanelDom.innerHTML = html;
}

function updateTopCountriesFromCurrent() {
  updateForDate(currentDateIndex);
}

function initGUI() {
  gui = new GUI({ title: "Controles" });

  dateController = gui
    .add(settings, "dateIndex", 0, Math.max(0, dates.length - 1))
    .step(1)
    .name("Fecha")
    .listen();
  dateController.onChange(function (v) {
    updateForDate(Math.floor(v));
  });

  gui
    .add(settings, "playing")
    .name("Reproducción")
    .onChange(function (playing) {
      if (playing) startPlay();
      else stopPlay();
    });

  gui
    .add(settings, "speedMs", 100, 2000)
    .step(50)
    .name("Velocidad (ms)")
    .onChange(function () {
      if (settings.playing) {
        restartPlay();
      }
    });

  gui
    .add(settings, "cumulative")
    .name("Acumulado")
    .onChange(function () {
      updateForDate(settings.dateIndex);
    });

  gui
    .add(settings, "baseDotSize", 0.001, 0.5)
    .step(0.001)
    .name("Tamaño base")
    .onChange(function () {
      updateForDate(settings.dateIndex);
    });

  gui
    .add(settings, "topN", 1, 50)
    .step(1)
    .name("Top N")
    .onChange(function () {
      updateForDate(settings.dateIndex);
    });

  gui.add(settings, "resetView").name("Reset cámara");

  gui.add(settings, "dateLabel").name("Fecha actual").listen();
}

function updateGuiDateControllerValue(idx) {
  settings.dateIndex = idx;
  if (dates.length > 0) {
    var d = new Date(dates[idx]);
    settings.dateLabel = d.toLocaleDateString();
  } else {
    settings.dateLabel = "";
  }
}

function startPlay() {
  if (playInterval) return;
  settings.playing = true;
  playInterval = setInterval(function () {
    currentDateIndex++;
    if (currentDateIndex >= dates.length) {
      currentDateIndex = 0;
    }
    updateForDate(currentDateIndex);
  }, settings.speedMs);
}

function stopPlay() {
  settings.playing = false;
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
}

function restartPlay() {
  stopPlay();
  startPlay();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

window.addEventListener("resize", function () {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

init();
