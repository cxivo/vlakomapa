import { TRAINS } from "./trainTypes";

export class Station {
  constructor(id, name, lat, long) {
    this.id = id;
    this.name = name;
    this.lat = lat;
    this.long = long;
  }
}

export class PlaceTime {
  constructor(stopId, arrival, departure, doesStop) {
    this.stopId = stopId;
    this.arrival = arrival;
    this.departure = departure;
    this.doesStop = doesStop;
  }
}

export class Train {
  constructor(
    id,
    serviceId,
    shapeId,
    destination,
    name,
    serviceName,
    direction
  ) {
    this.id = id;
    this.serviceId = serviceId;
    this.shapeId = shapeId;
    this.destination = destination;
    this.name = name;
    this.direction = direction;
    this.serviceName = serviceName;

    if (this.name.startsWith("Os")) {
      this.type = TRAINS.TRAIN_Os;
    } else if (this.name.startsWith("Zr")) {
      this.type = TRAINS.TRAIN_Zr;
    } else if (this.name.startsWith("REX")) {
      this.type = TRAINS.TRAIN_REX;
    } else if (this.name.startsWith("R")) {
      this.type = TRAINS.TRAIN_R;
    } else if (this.name.startsWith("Ex")) {
      this.type = TRAINS.TRAIN_Ex;
    } else if (this.name.startsWith("IC")) {
      this.type = TRAINS.TRAIN_IC;
    } else if (this.name.startsWith("SC")) {
      this.type = TRAINS.TRAIN_SC;
    } else if (this.name.startsWith("EN")) {
      this.type = TRAINS.TRAIN_EN;
    } else if (this.name.startsWith("EC")) {
      this.type = TRAINS.TRAIN_EC;
    } else if (this.name.startsWith("RJX")) {
      this.type = TRAINS.TRAIN_RJX;
    } else {
      this.type = TRAINS.TRAIN_UNKNOWN;
    }
  }

  setJourney(journey) {
    this.journey = journey;
  }
}
