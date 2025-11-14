import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import GUI from "lil-gui";

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});
let scene;
let camera;
let renderer;
let grid;
let estrella;
let Planetas = [],
  Lunas = [],
  objetos = [];
let timestamp;
let accglobal = 0.005;
let t0;
const keys = {};
const textureLoader = new THREE.TextureLoader();
const viaLactea = textureLoader.load("resources/milkyway.png");
const dayTexture = textureLoader.load("resources/earth_atmos_2048.jpg");
const nightTexture = textureLoader.load("resources/earthlights1k.jpg");
const earthRadius = 0.1;
const planetScale = 10;
const AU = 200 * earthRadius;
let useShipCamera = false;
let shipCamera;
let camcontrols;
let ship = null;
// https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures
const planetTextures = {
  mercurio: textureLoader.load("resources/moon_1024.jpg"), // no encontré mercurio
  venus: textureLoader.load("resources/Venus.jpg"),
  marte: textureLoader.load("resources/Mars.jpg"),
  jupiter: textureLoader.load("resources/Jupiter.jpg"),
  saturno: textureLoader.load("resources/Saturn.jpg"),
  urano: textureLoader.load("resources/Uranus.jpg"), // no encontré urano
  neptuno: textureLoader.load("resources/Neptune.jpg"),
  luna: textureLoader.load("resources/moon_1024.jpg"),
};
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
init();
animate();
function init() {
  scene = new THREE.Scene();
  initCamera();
  initRenderer();
  initCamControl();

  SolarSystem();
  // via láctea -> esfera con texturas doble cara
  ViaLactea();
  initLights();
  initShip();

  // inicializar tiempo
  t0 = 0;
}

function animate() {
  timestamp = (Date.now() - t0) * accglobal;
  requestAnimationFrame(animate);
  for (let object of Planetas) {
    object.position.x =
      Math.cos(timestamp * object.userData.speed) *
      object.userData.f1 *
      object.userData.dist;
    object.position.y =
      Math.sin(timestamp * object.userData.speed) *
      object.userData.f2 *
      object.userData.dist;
    object.rotation.y += 1 / 100.0;
    object.rotation.x += 0.25 / 100.0;
  }
  for (let object of Lunas) {
    object.position.x =
      Math.cos(timestamp * object.userData.speed) * object.userData.dist;
    object.position.y =
      Math.sin(timestamp * object.userData.speed) * object.userData.dist;
  }
  estrella.rotation.y += 0.0042;
  updateShip();
  if (useShipCamera) {
    renderer.render(scene, shipCamera);
  } else {
    renderer.render(scene, camera);
  }
}
function Estrella(rad, col) {
  let geometry = new THREE.SphereGeometry(rad, 20, 20);
  const material = new THREE.MeshStandardMaterial({
    emissive: new THREE.Color(col),
    emissiveIntensity: 3.0, // controla el brillo del sol
    color: 0xffffff, // color base del material
  });
  estrella = new THREE.Mesh(geometry, material);
  estrella.castShadow = false;
  scene.add(estrella);
}

function Planeta(radio, dist, vel, col, f1, f2, texName = null) {
  let geom = new THREE.SphereGeometry(radio, 32, 32);

  let mat;
  if (texName && planetTextures[texName]) {
    mat = new THREE.MeshPhongMaterial({
      map: planetTextures[texName],
    });
  } else {
    mat = new THREE.MeshPhongMaterial({ color: col });
  }

  let planeta = new THREE.Mesh(geom, mat);
  planeta.userData = { dist, speed: vel, f1, f2 };

  Planetas.push(planeta);
  scene.add(planeta);
}

function Luna(planeta, radio, dist, vel, col, angle) {
  var pivote = new THREE.Object3D();
  pivote.rotation.x = angle;
  planeta.add(pivote);
  var geom = new THREE.SphereGeometry(radio, 10, 10);
  var mat = new THREE.MeshPhongMaterial({
    color: col,
    map: planetTextures[luna],
  });
  var luna = new THREE.Mesh(geom, mat);
  luna.userData.dist = dist;
  luna.userData.speed = vel;

  Lunas.push(luna);
  pivote.add(luna);
}

function ViaLactea() {
  let geometry = new THREE.SphereGeometry(400, 24, 24);
  let material = new THREE.MeshPhongMaterial({
    color: 0xffffff, // white
    map: viaLactea,
    side: THREE.BackSide,
  });

  let mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
  objetos.push(mesh);
}
function Tierra(radio, dist, vel) {
  const geometry = new THREE.SphereGeometry(radio, 64, 64);

  // Material diurno (responde a la luz)
  const dayMaterial = new THREE.MeshStandardMaterial({
    map: dayTexture,
  });
  const dayEarth = new THREE.Mesh(geometry, dayMaterial);

  // Material nocturno (no responde a luz)
  const nightMaterial = new THREE.MeshBasicMaterial({
    map: nightTexture,
    blending: THREE.MultiplyBlending, // en vez de Additive
    transparent: true,
    opacity: 1.0,
  });
  const nightEarth = new THREE.Mesh(geometry, nightMaterial);
  nightEarth.scale.setScalar(1.001);

  // Grupo Tierra
  const earthGroup = new THREE.Group();
  earthGroup.add(dayEarth);
  earthGroup.add(nightEarth);

  // Luz direccional para simular el Sol
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(50, 0, 0);
  scene.add(sunLight);

  // Datos orbitales
  earthGroup.userData = { dist, speed: vel, f1: 1, f2: 1 };
  Planetas.push(earthGroup);
  scene.add(earthGroup);

  // Rotación de la Tierra
  earthGroup.rotation.y = Math.PI; // para que empiece con el lado diurno hacia el sol

  return earthGroup;
}

function initLights() {
  // planetas -> producen y reciben sombra
  for (let object of Planetas) {
    object.receiveShadow = true;
    object.castShadow = true;
  }
  // lunas -> reciben sombra
  for (let object of Lunas) {
    object.receiveShadow = true;
  }
  // Luz ambiente
  const Lamb = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(Lamb);
  // Luz puntual en el sol
  const Lpunt = new THREE.PointLight(0xffffff, 1, 0, 0);
  Lpunt.castShadow = true;
  Lpunt.position.set(0, 0, 0);
  Lpunt.shadow.mapSize.set(2048, 2048);
  Lpunt.shadow.camera.near = 0.5;
  Lpunt.shadow.camera.far = 500;
  scene.add(Lpunt);
}

function SolarSystem() {
  // Sol
  Estrella(109 * earthRadius, 0xffff00);
  Planeta(
    planetScale * 0.38 * earthRadius,
    0.65 * AU,
    -0.06,
    0xaaaaaa,
    1,
    1,
    "mercurio"
  ); // Mercurio
  Planeta(
    planetScale * 0.95 * earthRadius,
    0.72 * AU,
    0.1,
    0xffcc66,
    1,
    1,
    Math.PI / 2,
    "venus"
  ); // Venus
  const tierra = Tierra(planetScale * 1.0 * earthRadius, 1.0 * AU, 0.03); // Tierra
  Luna(
    tierra,
    planetScale * 0.27 * earthRadius,
    2.75,
    0.023,
    0xffffff,
    (4 * Math.PI) / 5
  );
  Planeta(
    planetScale * 0.53 * earthRadius,
    1.52 * AU,
    -0.026,
    0xff0000,
    1,
    1,
    "marte"
  );
  Planeta(
    planetScale * 11.2 * earthRadius,
    5.2 * AU,
    +0.04,
    0xffaa00,
    1,
    1,
    "jupiter"
  );
  Planeta(
    planetScale * 9.4 * earthRadius,
    9.58 * AU,
    -0.006,
    0xffeeaa,
    1,
    1,
    "saturno"
  );
  /*
    Planeta(
      planetScale * 4.0 * earthRadius,
      19.2 * AU,
      +0.0045,
      0x66ccff,
      1,
      1,
      "urano"
    );
    Planeta(
      planetScale * 3.9 * earthRadius,
      30.05 * AU,
      -0.009,
      0x3366ff,
      1,
      1,
      "neptuno"
    );
    */
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // por defecto THREE.PCFShadowMap
  document.body.appendChild(renderer.domElement);
}
function initCamera() {
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 250);
  shipCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  shipCamera.position.set(150, 150, 150); // posición inicial de la nave
}
function initCamControl() {
  camcontrols = new OrbitControls(camera, renderer.domElement);
  camcontrols.minDistance = 30;
  camcontrols.maxDistance = 400;
  /*
  camcontrols.enableDamping = true;
  camcontrols.dampingFactor = 0.05;
  */
}

function updateShipCamera() {
  const speed = 0.05;
  const rotSpeed = 0.02;

  // Rotaciones (izquierda/derecha, arriba/abajo)
  if (keys["arrowleft"]) shipCamera.rotation.y -= rotSpeed;
  if (keys["arrowright"]) shipCamera.rotation.y += rotSpeed;
  if (keys["arrowup"]) shipCamera.rotation.x += rotSpeed;
  if (keys["arrowdown"]) shipCamera.rotation.x -= rotSpeed;

  // Movimiento WASD en la dirección de la cámara
  const forward = new THREE.Vector3();
  shipCamera.getWorldDirection(forward);

  if (keys["w"]) shipCamera.position.addScaledVector(forward, speed);
  if (keys["s"]) shipCamera.position.addScaledVector(forward, -speed);

  // Movimiento lateral (strafe)
  const right = new THREE.Vector3();
  right.crossVectors(forward, shipCamera.up).normalize();
  if (keys["a"]) shipCamera.position.addScaledVector(right, -speed);
  if (keys["d"]) shipCamera.position.addScaledVector(right, speed);
}
function updateShip() {
  const speed = 0.08;
  const rotSpeed = 0.03;
  if (!ship) return; // no hacer nada hasta que la nave esté cargada

  // ROTACIÓN de la nave
  if (keys["arrowleft"]) ship.rotation.y += rotSpeed;
  if (keys["arrowright"]) ship.rotation.y -= rotSpeed;
  if (keys["arrowup"]) ship.rotation.x += rotSpeed * 0.5;
  if (keys["arrowdown"]) ship.rotation.x -= rotSpeed * 0.5;

  // Movimiento local: forward corregido
  const forward = new THREE.Vector3(0, 0, 1) // ← notar el 1 en Z
    .applyQuaternion(ship.quaternion)
    .normalize();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(ship.quaternion)
    .normalize();

  if (keys["w"]) ship.position.addScaledVector(forward, speed);
  if (keys["s"]) ship.position.addScaledVector(forward, -speed);
  if (keys["a"]) ship.position.addScaledVector(right, +speed);
  if (keys["d"]) ship.position.addScaledVector(right, -speed);
}

function initShip() {
  mtlLoader.load("resources/SpaceShip.mtl", function (materials) {
    materials.preload();

    objLoader.setMaterials(materials);
    objLoader.load("resources/SpaceShip.obj", function (object) {
      ship = object;
      ship.scale.set(0.5, 0.5, 0.5);

      // posiciona el ship donde está actualmente la cámara orbital
      ship.position.set(0, 0, 125);

      ship.lookAt(new THREE.Vector3(0, 0, 0));

      ship.quaternion.copy(camera.quaternion);
      ship.rotation.y = Math.PI; // 180 grados
      // si quieres offset inicial (por ejemplo, que la nave no tape la cámara)
      // ship.position.add(new THREE.Vector3(0, -5, -10).applyQuaternion(camera.quaternion));

      scene.add(ship);

      // colocar la shipCamera dentro de la cabina (coordenadas locales de la nave)
      // después de cargar la nave
      shipCamera.position.set(0, 2, -8); // detrás de la cabina
      shipCamera.lookAt(
        new THREE.Vector3(0, 2, 0).add(new THREE.Vector3(0, 0, -1))
      );
      // mira hacia el frente de la nave
      ship.add(shipCamera);
    });
  });
}
window.addEventListener("keydown", (e) => {
  // evita que la tecla 'c' también setee en keys[] si ya lo hace tu listener principal
  if (e.key.toLowerCase() === "c") {
    useShipCamera = !useShipCamera;
    // desactiva orbitcontrols cuando usamos la cámara nave
    if (camcontrols) camcontrols.enabled = !useShipCamera;

    // opcional: cuando cambies a cámara nave, fija la cámara en la nave inmediatamente
    if (useShipCamera && ship) {
      // acercar la cámara a la nave si es necesario
      // (si quieres centrar, por ejemplo:)
      // shipCamera.position.set(0,2,8);
      // shipCamera.lookAt(ship.position);
    } else {
      // si vuelves a vista orbital, puedes poner el target al centro
      if (camcontrols) {
        camcontrols.target.set(0, 0, 0);
        camcontrols.update();
      }
    }
  }
});
