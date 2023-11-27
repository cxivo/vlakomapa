import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import WebGL from "three/addons/capabilities/WebGL.js";
import initSqlJs from "sql.js";
import { getMercatorLat, getMercatorLong } from "./mapFunctions";
import { Station, Train, PlaceTime } from "./railwayObjects";
import { TRAINS } from "./trainTypes";
import { stations, trains, scene, map, db, camera } from "./main";

let lines = [];
let date = new Date();
let filteredTrains = [];
let foundTrainLine = null;
let selectedStationLine = null;

////////////////////////////////////////////////////////////////////////////////////
// helper functions
////////////////////////////////////////////////////////////////////////////////////

export function timeToSeconds(time) {
  if (String(time).length <= 5) {
    return -1;
  }
  const a = String(time).split(":");
  return 3600 * Number(a[0]) + 60 * Number(a[1]); //+ Number(a[2]);
}

function secondsToTime(seconds) {
  const date = new Date(seconds * 1000);
  return date.toISOString().substring(11, 16);
}

function getStopFromId(id) {
  return stations.find((x) => x.id == id);
}

function getStopFromName(name) {
  const index = stations.findIndex((x) => x.name == name);
  if (index >= 0) {
    return stations[index];
  } else {
    return null;
  }
}

function getTrainFromId(id) {
  return trains.find((x) => x.id == id);
}

export function getDistance(from, to) {
  const fromStop = getStopFromId(from.stopId);
  const toStop = getStopFromId(to.stopId);

  return Math.sqrt(
    (fromStop.lat - toStop.lat) ** 2 + (fromStop.long - toStop.long) ** 2
  );
}

function addStation(station) {
  const geometry = new THREE.SphereGeometry(0.008, 4, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x007fff });
  const marker = new THREE.Mesh(geometry, material);

  marker.name = "STATION " + station.id; // this is useful for clicking
  marker.position.z = getMercatorLat(station.lat);
  marker.position.x = getMercatorLong(station.long);
  scene.add(marker);
}

function addTrain(train, offset, special = false) {
  if (train.type.shown) {
    const timeConstant = 0.0001;
    const material = new THREE.LineBasicMaterial({
      color: train.type.color,
      linewidth: special ? 6 : 2,
    });
    const points = [];
    let previousTime = getStopFromId(train.journey[0].stopId).arrival;

    train.journey.forEach((x) => {
      const stop = getStopFromId(x.stopId);

      // midnight fix
      if (x.arrival < previousTime) {
        offset -= 24 * 60 * 60;
      }
      previousTime = x.arrival;

      points.push(
        new THREE.Vector3(
          getMercatorLong(stop.long),
          (x.arrival - offset) * timeConstant,
          getMercatorLat(stop.lat)
        )
      );

      // midnight fix
      if (x.departure < previousTime) {
        offset -= 24 * 60 * 60;
      }
      previousTime = x.departure;

      points.push(
        new THREE.Vector3(
          getMercatorLong(stop.long),
          (x.departure - offset) * timeConstant,
          getMercatorLat(stop.lat)
        )
      );
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.name = "TRAIN " + train.id;

    if (special) {
      foundTrainLine = line;
      line.position.y = lines[0].position.y;
    }

    lines.push(line);
    scene.add(line);
  }
}

function addTrainsAroundDate(date) {
  const dateStringToday = date
    .toISOString()
    .substring(0, 10)
    .replaceAll("-", "");
  const dateStringYesterday = new Date(date.getTime() - 24 * 60 * 60)
    .toISOString()
    .substring(0, 10)
    .replaceAll("-", "");
  const dateStringTomorrow = new Date(date.getTime() + 24 * 60 * 60)
    .toISOString()
    .substring(0, 10)
    .replaceAll("-", "");

  const dates = [dateStringYesterday, dateStringToday, dateStringTomorrow];

  for (let i = 0; i < 3; i++) {
    const trainsGoingIds = new Set(
      db
        .exec(
          `SELECT trips.trip_id 
            FROM dates 
            JOIN trips ON dates.service_id = trips.service_id 
            WHERE dates.date = ` +
            dates[i] +
            ` AND dates.exception_type = 1
            ORDER BY trips.trip_id;`
        )[0]
        .values.map((x) => x[0])
    );

    filteredTrains.forEach((train) => {
      if (trainsGoingIds.has(train.id)) {
        addTrain(train, (i - 1) * 24 * 60 * 60);
      }
    });
  }
}

export function updateCategories() {
  // updates which train categories to render
  Object.entries(TRAINS).forEach((type) => {
    type[1].shown = document.getElementById(type[0].toLowerCase()).checked;
  });

  refreshScene();
}

export function setTimeFromPicker() {
  date = new Date(document.getElementById("datePicker").value);
  date.setTime(date.getTime());
  refreshScene();
}

export function setTimeNow() {
  date = new Date();
  refreshScene();
}

function updateVisuals() {
  let seconds =
    3600 * date.getHours() + 60 * date.getMinutes() + date.getSeconds();

  lines.forEach((line) => {
    line.position.y = -0.0001 * seconds;
  });

  // I do NOT want to know what happens when the DST is changed...
  document.getElementById("datePicker").value = new Date(
    date.getTime() - date.getTimezoneOffset() * 60 * 1000
  )
    .toISOString()
    .substring(0, 16);
}

export function shiftTime(amount) {
  const oldDate = new Date(date);
  date.setTime(date.getTime() - 2000 * amount);

  if (oldDate.getDate() != date.getDate()) {
    refreshScene();
  } else {
    updateVisuals();
  }
}

// (re)adds all objects to the scene
export function refreshScene() {
  // clear arrays
  scene.clear();
  lines = [];

  scene.add(map);

  // add all stations
  stations.forEach((station) => {
    addStation(station);
  });

  addTrainsAroundDate(date);

  updateVisuals();
}

export function loadTrains() {
  // Warning! "WHERE trips.trip_id < 20000" was added to remove weird shapes.
  // It might remove real trains! But who knows, it mostly just screws stuff up.
  const trains = db
    .exec(
      `SELECT trips.trip_id, trips.service_id, trips.trip_headsign, trips.trip_short_name, 
      trips.direction_id, trips.shape_id, routes.route_long_name 
      FROM trips JOIN routes ON trips.route_id = routes.route_id
      WHERE trips.trip_id < 20000
      ORDER BY trips.trip_id`
    )[0]
    .values.map(
      (x) =>
        new Train(
          Number(x[0]),
          Number(x[1]),
          Number(x[5]),
          x[2],
          x[3],
          x[6],
          Number(x[4])
        )
    );

  const allPlaces = db.exec(
    `SELECT trips.trip_id, stops.stop_id, shapes.shape_pt_sequence, stop_times.arrival_time, stop_times.departure_time 
  FROM trips 
  JOIN shapes ON shapes.shape_id = trips.shape_id 
  JOIN stops ON shapes.shape_pt_lat = stops.stop_lat AND shapes.shape_pt_lon = stops.stop_lon
  LEFT JOIN stop_times ON stops.stop_id = stop_times.stop_id AND trips.trip_id = stop_times.trip_id
  ORDER BY trips.trip_id ASC, shapes.shape_pt_sequence ASC;`
  )[0].values;

  // get places the train goes through
  let placePos = 0;
  console.log(trains.length);

  trains.forEach((train) => {
    const places = [];

    // copy places
    while (placePos < allPlaces.length && allPlaces[placePos][0] == train.id) {
      const x = allPlaces[placePos];
      places.push(
        new PlaceTime(
          x[1],
          timeToSeconds(x[3]) == -1 ? timeToSeconds(x[4]) : timeToSeconds(x[3]),
          timeToSeconds(x[4]) == -1 ? timeToSeconds(x[3]) : timeToSeconds(x[4]),
          isNaN(x[3]) && isNaN(x[4]) ? 1 : 0
        )
      );
      placePos += 1;
    }

    // define remaining times
    let lastDeparture = places[0].departure;
    let noStopCount = 0;
    let noStopLength = 0;
    for (let i = 1; i < places.length; i++) {
      if (places[i].arrival == -1) {
        noStopCount += 1;
        noStopLength += getDistance(places[i - 1], places[i]);
      } else {
        if (noStopCount > 0) {
          noStopLength += getDistance(places[i - 1], places[i]);
        }
        const unitTime = (places[i].arrival - lastDeparture) / noStopLength;
        for (let j = noStopCount; j > 0; j--) {
          lastDeparture =
            lastDeparture +
            unitTime * getDistance(places[i - j - 1], places[i - j]);
          places[i - j].arrival = lastDeparture;
          places[i - j].departure = lastDeparture;
        }
        lastDeparture = places[i].departure;
        noStopCount = 0;
        noStopLength = 0;
      }
    }
    if (placePos < 100) console.log(places);

    train.setJourney(places);
  });

  filteredTrains = trains;
  return trains;
}

export function loadStations() {
  return db
    .exec("SELECT * FROM stops ORDER BY stops.stop_id")[0]
    .values.map(
      (x) => new Station(Number(x[0]), x[1], Number(x[2]), Number(x[3]))
    );
}

export function filterTrains() {
  const stop = getStopFromName(document.getElementById("place-choice").value);

  if (stop == null) {
    filteredTrains = trains;
  } else {
    const option = document.getElementById("way1").value;
    let filter = (x) => true;

    if (option == "starts") {
      filter = (x) => x.journey[0].stopId == stop.id;
    } else if (option == "ends") {
      filter = (x) => x.journey[x.journey.length - 1].stopId == stop.id;
    } else if (option == "stops") {
      filter = (x) => x.journey.some((y) => y.stopId == stop.id && y.doesStop);
    } else {
      // option == "passes"
      filter = (x) => x.journey.some((y) => y.stopId == stop.id);
    }

    filteredTrains = trains.filter(filter);
  }
  refreshScene();

  if (stop != null) {
    // add a line on the screen for the station
    const material = new THREE.LineBasicMaterial({
      color: 0x404040,
      linewidth: 1,
    });

    const points = [
      new THREE.Vector3(
        getMercatorLong(stop.long),
        0,
        getMercatorLat(stop.lat)
      ),
      new THREE.Vector3(
        getMercatorLong(stop.long),
        20,
        getMercatorLat(stop.lat)
      ),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    selectedStationLine = line;

    scene.add(line);
  }
}

let mousePressedAt = new Date();

export function mouseDown(event) {
  if (event.button == 0) {
    mousePressedAt = new Date();
  }
}

export function selectObject(event) {
  // user probably wanted to move the scene if they pressed for more than 250ms
  if (new Date().getTime() - mousePressedAt.getTime() >= 250) {
    return;
  }

  document.getElementById("train-info").innerHTML = "";
  if (foundTrainLine != null) {
    scene.remove(foundTrainLine);
    foundTrainLine = null;
  }

  // calculate pointer position in normalized device coordinates
  // (-1 to +1) for both components
  const pointerX = (event.clientX / window.innerWidth) * 2 - 1;
  const pointerY = -(event.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(pointerX, pointerY), camera);
  raycaster.near = 0.01;
  raycaster.params.Points.threshold = 0.001;
  raycaster.params.Line.threshold = 0.01;

  const intersects = raycaster.intersectObjects(scene.children);

  const maybeMap = intersects.find((x) => x.object.name == "MAP");
  let maxDistance = Infinity;

  if (maybeMap != null) {
    maxDistance = maybeMap.distance;
  }

  for (let i = 0; i < intersects.length; i++) {
    if (
      intersects[i].object.name.startsWith("STATION") &&
      intersects[i].distance <= maxDistance
    ) {
      const stop = getStopFromId(
        new Number(intersects[i].object.name.substring(8))
      );
      document.getElementById("place-choice").value = stop.name;

      filterTrains();

      break;
    } else if (
      intersects[i].object.name.startsWith("TRAIN") &&
      intersects[i].distance <= maxDistance
    ) {
      const foundTrain = getTrainFromId(
        new Number(intersects[i].object.name.substring(6))
      );

      console.log("trip id: " + foundTrain.id);

      addTrain(foundTrain, 0, true);
      scene.updateMatrix();

      document.getElementById("train-info").innerHTML =
        writeTrainInfo(foundTrain);
      break;
    }
  }
}

export function deselectObject() {
  document.getElementById("place-choice").value = "";
  document.getElementById("train-info").innerHTML = "";
  filterTrains();
  if (foundTrainLine != null) {
    scene.remove(foundTrainLine);
    foundTrainLine = null;
  }
  if (selectedStationLine != null) {
    scene.remove(selectedStationLine);
    selectedStationLine = null;
  }
}

function writeTrainInfo(train) {
  let text =
    "<p><strong>" +
    //train.serviceName +  doesn't work
    getStopFromId(train.journey[0].stopId).name +
    " - " +
    getStopFromId(train.journey[train.journey.length - 1].stopId).name +
    "</strong></p>" +
    "<p>" +
    train.name +
    "</p>" +
    "<p>" +
    secondsToTime(train.journey[0].departure) +
    "&nbsp; - &nbsp;" +
    secondsToTime(train.journey[train.journey.length - 1].arrival) +
    "</p>" +
    '<div id="stop-list-div"><table id="stop-list">';

  train.journey.forEach((place) => {
    if (place.doesStop) {
      text +=
        '<tr><td class="time-td">' +
        secondsToTime(place.arrival) +
        '</td><td class="time-td">' +
        secondsToTime(place.departure) +
        "</td><td>" +
        getStopFromId(place.stopId).name +
        "</td></tr>";
    } else {
      text +=
        '<tr><td class="time-td">' +
        '</td><td class="time-td">' +
        '</td><td class="pass-thru">' +
        getStopFromId(place.stopId).name +
        "</td></tr>";
    }
  });

  text += "</div></table>";

  return text;
}
