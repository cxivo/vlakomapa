import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import WebGL from "three/addons/capabilities/WebGL.js";
import initSqlJs from "sql.js";
import {
  timeToSeconds,
  getDistance,
  refreshScene,
  loadTrains,
  loadStations,
  filterTrains,
  updateCategories,
  setTimeNow,
  setTimeFromPicker,
  mouseDown,
  selectObject,
  deselectObject,
  shiftTime,
} from "./helperFunctions.js";
import databaseUrl from "../gtfs/database.sqlite";

////////////////////////////////////////////////////////////////////////////////////
// data part
////////////////////////////////////////////////////////////////////////////////////

// loading data
const sqlPromise = initSqlJs({
  locateFile: (file) => `https://sql.js.org/dist/${file}`,
});

const dataPromise = fetch(databaseUrl).then((res) => res.arrayBuffer());
const SQL = await sqlPromise;
const buf = await dataPromise;

export const db = new SQL.Database(new Uint8Array(buf));

const date1 = new Date();

// get list of stations and trains
export const stations = loadStations();
export const trains = loadTrains();

console.log("Loading took " + (new Date().getTime() - date1.getTime()) + "ms");

////////////////////////////////////////////////////////////////////////////////////
// rendering part
////////////////////////////////////////////////////////////////////////////////////

export const scene = new THREE.Scene();

// FOV, aspect ratio, near clipping plane, far clipping plane
export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.02,
  50
);

// camera
camera.position.set(0, 2, 4);
camera.lookAt(0, 0, 0);

// renderer
export const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// camera controls
export const controls = new OrbitControls(camera, renderer.domElement);
controls.update();

// map
const TILE_SIZE = 0.43;

//const geometry = new THREE.PlaneGeometry(IMAGE_WIDTH, IMAGE_HEIGHT);
const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

//const minLat = 47.1, minLong = 14.5, maxLat = 50.0, maxLong = 22.4;
const osmZoom = 10,
  minX = 552,
  minY = 345,
  baseI = 8,
  baseJ = 10;
export let map = [];

// tiles
for (let i = 0; i < 25; i++) {
  for (let j = 0; j < 14; j++) {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

    const texture = new THREE.TextureLoader().load(
      "https://tile.openstreetmap.org/" +
        osmZoom +
        "/" +
        (minX + i) +
        "/" +
        (minY + j) +
        ".png"
    );
    texture.repeat.set(1, 1);
    material.map = texture;

    const tile = new THREE.Mesh(geometry, material);
    tile.rotation.x = -Math.PI / 2;
    tile.name = "MAP";
    tile.position.set(
      TILE_SIZE * (i - baseI) - 3.26,
      0,
      TILE_SIZE * (j - baseJ) + 1.08
    );
    map.push(tile);
  }
}


const datalistPlaces = document.getElementById("stations-list");
stations.forEach((station) => {
  datalistPlaces.insertAdjacentHTML(
    "beforeend",
    '<option value="' + station.name + '"></option>'
  );
});

// animation loop
function animate() {
  requestAnimationFrame(animate);

  /*
  console.log(controls.target);

  if (controls.target.y < 0) {
    controls.target.y = 0;
  }
  */

  // keeps the camera at the same height
  controls.target.y = 0;
  controls.update();

  renderer.render(scene, camera);
}

// test if WebGL is available
if (WebGL.isWebGLAvailable()) {
  refreshScene();
  animate();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("container").appendChild(warning);
}

////////////////////////////////////////////////////////////////////////////////////
// listeners
////////////////////////////////////////////////////////////////////////////////////

// resizing
window.addEventListener(
  "resize",
  () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  false
);

// category
document.getElementById("train_os").addEventListener("click", updateCategories);
document.getElementById("train_zr").addEventListener("click", updateCategories);
document
  .getElementById("train_rex")
  .addEventListener("click", updateCategories);
document.getElementById("train_r").addEventListener("click", updateCategories);
document.getElementById("train_ex").addEventListener("click", updateCategories);
document.getElementById("train_ec").addEventListener("click", updateCategories);
document.getElementById("train_ic").addEventListener("click", updateCategories);
document.getElementById("train_sc").addEventListener("click", updateCategories);
document.getElementById("train_en").addEventListener("click", updateCategories);
document
  .getElementById("train_rjx")
  .addEventListener("click", updateCategories);
document
  .getElementById("train_unknown")
  .addEventListener("click", updateCategories);

// times
document.getElementById("timeNowButton").addEventListener("click", setTimeNow);
document
  .getElementById("datePicker")
  .addEventListener("change", setTimeFromPicker);

// filter
document
  .getElementById("place-choice")
  .addEventListener("change", filterTrains);
document.getElementById("place-choice").addEventListener("keyup", (e) => {
  if (e.key == "Enter") {
    console.log("keyup");
    filterTrains();
  }
});

document.getElementById("way1").addEventListener("change", filterTrains);

function rotateCamera(direction) {
  controls.autoRotateSpeed = direction * 20;
  controls.autoRotate = true;
  controls.update();

  setInterval(() => {
    controls.autoRotate = false;
    controls.update();
  }, 2);
}

const SCROLL_AMOUNT = 128.0;
const ZOOM_AMOUNT = 0.025;

// move time around
document.addEventListener(
  "keydown",
  (e) => {
    let vector = new THREE.Vector3();
    vector = vector.subVectors(controls.target, camera.position);

    switch (e.key) {
      case "Shift":
        controls.enabled = false;
        break;
      case "Escape":
        deselectObject();
        break;
      case "+":
        shiftTime(-SCROLL_AMOUNT);
        break;
      case "-":
        shiftTime(SCROLL_AMOUNT);
        break;
      case "ArrowUp":
        camera.translateOnAxis(vector, ZOOM_AMOUNT);
        break;
      case "ArrowDown":
        camera.translateOnAxis(vector, -ZOOM_AMOUNT);
        break;
      case "ArrowLeft":
        rotateCamera(1);
        break;
      case "ArrowRight":
        rotateCamera(-1);
        break;
    }
  },
  false
);

document.addEventListener("wheel", (e) => {
  if (!controls.enabled) {
    shiftTime(e.deltaY);
  }
});


document.addEventListener(
  "keyup",
  (e) => {
    if (e.key == "Shift") {
      controls.enabled = true;
    }
  },
  false
);

// clicking
renderer.domElement.addEventListener("mousedown", mouseDown);

renderer.domElement.addEventListener("mouseup", selectObject);
