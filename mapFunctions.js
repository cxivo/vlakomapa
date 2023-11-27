export const MAX_LAT = toWebMercator(49.67);
export const MIN_LAT = toWebMercator(47.693);
export const MAX_LONG = 22.706;
export const MIN_LONG = 16.729;
export const LAT_DIF = MAX_LAT - MIN_LAT;
export const LONG_DIF = MAX_LONG - MIN_LONG;

export const IMAGE_WIDTH = 7.31;
export const IMAGE_HEIGHT = 3.663;

export function toWebMercator(deg) {
  return (
    180 * (Math.PI - Math.log(Math.tan(Math.PI / 4 + (Math.PI * deg) / 360))) -
    Math.PI
  );
}

export function getMercatorLat(latitude) {
  return -IMAGE_HEIGHT * ((toWebMercator(latitude) - MIN_LAT) / LAT_DIF - 0.5);
}

export function getMercatorLong(longitude) {
  return IMAGE_WIDTH * ((longitude - MIN_LONG) / LONG_DIF - 0.5);
}
