import * as THREE from "three";
import { getMercatorLat, getMercatorLong } from "./mapFunctions";
import { Station, Train, PlaceTime } from "./railwayObjects";
import { TRAINS } from "./trainTypes";
import { stations, trains, scene, map, db, camera, controls } from "./main";

let lines = [];
let date = new Date();
let filteredTrains = [];
let foundTrainLine = null;
let selectedStationLine = null;
let mousePressedAt = new Date();

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

    // makes it possible to tell for which day the line applies
    let offsetChar = "";
    if (offset == 0) {
      offsetChar = "0";
    } else if (offset < 0) {
      offsetChar = "-";
    } else {
      offsetChar = "+";
    }

    line.name = "TRAIN" + offsetChar + train.id;

    if (special) {
      foundTrainLine = line;
      line.position.y = lines[0].position.y;
    }

    lines.push(line);
    scene.add(line);
  }
}

function addTrainsAroundDate(date) {
  // need to offset the timezone, because otherwise the date won't be calculated correctly
  date = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

  const dateStringToday = date
    .toISOString()
    .substring(0, 10)
    .replaceAll("-", "");
  const dateStringYesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10)
    .replaceAll("-", "");
  const dateStringTomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10)
    .replaceAll("-", "");

  const dates = [dateStringYesterday, dateStringToday, dateStringTomorrow];

  // fetches the trains going today, yesterday and tomorrow
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
        ?.values?.map((x) => x[0])
    );

    // draws trains with the corresponding offset
    filteredTrains.forEach((train) => {
      if (trainsGoingIds.has(train.id)) {
        addTrain(train, (1 - i) * 24 * 60 * 60);
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
  refreshScene();
}

export function setTimeNow() {
  date = new Date();
  refreshScene();
}

export function setLocationFromBrowser() {
  navigator.geolocation.getCurrentPosition(
    loc => {
      console.log(loc);
      centerOn(loc.coords.latitude, loc.coords.longitude);
    }
  );
}

function centerOn(lat, long) {
  const oldTarget = controls.target;

  let percentage = 0.0;

  let id = setInterval(frame, 5);

  function frame() {
    if (percentage >= 1.0) {
      clearInterval(id);
    }

    controls.target.x =
      (1 - percentage) * oldTarget.x +
      percentage * getMercatorLong(long);
    controls.target.z =
      (1 - percentage) * oldTarget.z + percentage * getMercatorLat(lat);
    percentage += 0.01;
  }
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

  scene.add(...map);

  // add all stations
  stations.forEach((station) => {
    addStation(station);
  });

  addTrainsAroundDate(date);

  if (selectedStationLine != null) {
    scene.add(selectedStationLine);
  }

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
      WHERE trips.trip_id < 20000000
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
    )
    .filter((x) => !x.name.includes("/")); // Warning! this filters all through coaches, which is usually desirable (they clutter the map), but not always

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

  trains.forEach((train) => {
    const places = [];

    // copy places
    while (placePos < allPlaces.length && allPlaces[placePos][0] <= train.id) {
      // skip if train got filtered
      if (allPlaces[placePos][0] < train.id) {
        placePos += 1;
        continue;
      }

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

    // lambdas
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

  // remove the previous one
  if (selectedStationLine != null) {
    scene.remove(selectedStationLine);
  }

  // add a line on the screen for the station
  if (stop != null) {
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

    // animate moving there
    centerOn(stop.lat, stop.long);
  }
}

export function mouseDown(event) {
  if (event.button == 0) {
    mousePressedAt = new Date();
  }
}

function tryRayCast(pointerX, pointerY, radius, minDistance) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(pointerX, pointerY), camera);
  raycaster.near = minDistance;
  raycaster.params.Line.threshold = radius;

  // casts a ray
  const intersects = raycaster.intersectObjects(scene.children);

  const maybeMap = intersects.find((x) => x.object.name == "MAP");
  let maxDistance = Infinity;

  if (maybeMap != null) {
    maxDistance = maybeMap.distance;
  }

  // checks through all intersections
  for (let i = 0; i < intersects.length; i++) {
    if (
      intersects[i].object.name.startsWith("STATION") &&
      intersects[i].distance <= maxDistance
    ) {
      // STATION
      const stop = getStopFromId(
        new Number(intersects[i].object.name.substring(8))
      );
      document.getElementById("place-choice").value = stop.name;

      filterTrains();

      return true;
    } else if (
      intersects[i].object.name.startsWith("TRAIN") &&
      intersects[i].distance <= maxDistance
    ) {
      // TRAIN
      const foundTrain = getTrainFromId(
        new Number(intersects[i].object.name.substring(6))
      );

      console.log("trip id: " + foundTrain.id);

      // just to be sure, add highlights for all 3 shown days
      let multiplier = 0;
      if (intersects[i].object.name[5] == "0") {
        multiplier = 0;
      } else if (intersects[i].object.name[5] == "+") {
        multiplier = 1;
      } else {
        multiplier = -1;
      }

      addTrain(foundTrain, multiplier * 24 * 60 * 60, true);

      writeTrainInfo(foundTrain);
      document.getElementById("train-info").style.display = "block";
      return true;
    }
  }

  return false;
}

function deselectLine() {
  if (foundTrainLine != null) {
    scene.remove(foundTrainLine);
    foundTrainLine = null;
  }
}

export function selectObject(event) {
  // user probably wanted to move the scene if they pressed for more than 250ms
  if (new Date().getTime() - mousePressedAt.getTime() >= 250) {
    return;
  }

  document.getElementById("train-info").innerHTML = "";
  document.getElementById("train-info").style.display = "none";
  deselectLine();

  // calculate pointer position in normalized device coordinates
  // (-1 to +1) for both components
  const pointerX = (event.clientX / window.innerWidth) * 2 - 1;
  const pointerY = -(event.clientY / window.innerHeight) * 2 + 1;

  // this simulates a cone ray - we want to give higher distance tolerance to lines further away
  const attemptedRaycasts = [
    { radius: 0.01, minDistance: 0.01 },
    { radius: 0.02, minDistance: 0.2 },
    { radius: 0.03, minDistance: 0.4 },
    { radius: 0.04, minDistance: 0.6 },
    { radius: 0.05, minDistance: 1 },
    { radius: 0.07, minDistance: 1.5 },
  ];

  // repeatedly casts rays until a hit is found
  for (let i = 0; i < attemptedRaycasts.length; i++) {
    if (
      tryRayCast(
        pointerX,
        pointerY,
        attemptedRaycasts[i].radius,
        attemptedRaycasts[i].minDistance
      )
    ) {
      break;
    }
  }
}

export function deselectObject() {
  // resets filter and info
  document.getElementById("place-choice").value = "";
  document.getElementById("train-info").innerHTML = "";
  document.getElementById("train-info").style.display = "none";
  filterTrains();

  // removes selection highlights
  deselectLine();

  if (selectedStationLine != null) {
    scene.remove(selectedStationLine);
    selectedStationLine = null;
  }
}

function writeTrainInfo(train) {
  let category = train.name.split(" ")[0];
  let number = train.name.split(" ")[1];
  let name = train.name.split(" ").slice(2).join(" ");

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
    '</p><hr><div id="stop-list-div"><table id="stop-list">';

  train.journey.forEach((place) => {
    const stopName = getStopFromId(place.stopId).name;
    if (place.doesStop) {
      text +=
        "<tr><td class=\"time-td\" onclick=\"const datepicker = document.getElementById('datePicker'); datepicker.value = datepicker.value.substring(0, 11) + '" +
        secondsToTime(place.arrival) +
        "'; const e = new Event('change'); datepicker.dispatchEvent(e);\">" +
        secondsToTime(place.arrival) +
        "</td><td class=\"time-td\" onclick=\"const datepicker = document.getElementById('datePicker'); datepicker.value = datepicker.value.substring(0, 11) + '" +
        secondsToTime(place.departure) +
        "'; const e = new Event('change'); datepicker.dispatchEvent(e);\">" +
        secondsToTime(place.departure) +
        "</td><td class=\"place-td\" onclick=\"document.getElementById('place-choice').value = '" +
        stopName +
        "'; document.getElementById('way1').value = 'stops'; const e = new Event('change'); const element = document.getElementById('place-choice'); element.dispatchEvent(e); \">" +
        stopName +
        "</td></tr>";
    } else {
      text +=
        '<tr><td class="time-td">' +
        '</td><td class="time-td">' +
        "</td><td class=\"place-td pass-thru\" onclick=\"document.getElementById('place-choice').value = '" +
        stopName +
        "'; document.getElementById('way1').value = 'passes'; const e = new Event('change'); const element = document.getElementById('place-choice'); element.dispatchEvent(e); \">" +
        stopName +
        "</td></tr>";
    }
  });

  text += "</table></div>";

  text += `<hr><p>
    <a class="useful-link" href="https://www.vagonweb.cz/razeni/vlak.php?zeme=ZSSK&kategorie=${category}&cislo=${number}&nazev=${name}&rok=${date.getFullYear()}" target="_blank">radenie</a>
    |
    <a class="useful-link" href="https://meskanievlakov.info/vlak/${category}/${number}/" target="_blank">meškanie</a>
    |
    <a id="buy-ticket" class="useful-link" href="https://predaj.zssk.sk/search" target="_blank">kúpiť lístok</a>
  <p>`;

  /*  text += `<form id="searchParamForm" name="searchParamForm" method="post" action="https://predaj.zssk.sk/search" style="display: none;"  enctype="application/x-www-form-urlencoded">
    <input type="hidden" name="searchParamForm" value="searchParamForm">
    <input id="fromInput" type="hidden" name="fromInput" value="BRATISLAVA" data-cy="stationFrom">
    <input id="toInput" type="hidden" name="toInput" value="Košice" data-cy="stationTo">
    <input id="departDate" type="hidden" name="departDate" value="17. 1. 2025">
    <input id="departTime" type="hidden" name="departTime" value="23:25">
    <input id="departTimeIsArrival" type="hidden" name="departTimeIsArrival" value="false">
    </form>`; */

  document.getElementById("train-info").innerHTML = text;

  /* document
    .getElementById("buy-ticket")
    .addEventListener("click", function (event) {
      event.preventDefault(); // Prevent the default link action
      document.getElementById("searchParamForm").submit(); // Submit the form via POST
    }); */
}
