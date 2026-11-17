/**
 * SPECS Inc. 2027
 * MapboxMercator [BETA] – Web Mercator helpers for Map3D.
 *
 * Conventions:
 *  - "mercator" = EPSG:3857 meters (inflated by 1 / cos(lat) away from the equator).
 *  - "ground"   = true meters on the ground around a center point: x = east, y = north.
 *  - "map cm"   = Lens Studio local cm on the Map3D disc: +X east, -Z north, +Y up.
 */

export const EARTH_RADIUS_M = 6378137
export const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const MAX_LAT = 85.05112878

export type GroundPoint = {x: number; y: number}

export function clampLatitude(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
}

/** lon/lat (degrees) -> EPSG:3857 meters. */
export function lonLatToMercator(lon: number, lat: number): GroundPoint {
  const l = clampLatitude(lat) * DEG2RAD
  return {
    x: EARTH_RADIUS_M * lon * DEG2RAD,
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + l / 2))
  }
}

/** EPSG:3857 meters -> lon/lat (degrees). */
export function mercatorToLonLat(x: number, y: number): {lon: number; lat: number} {
  return {
    lon: (x / EARTH_RADIUS_M) * RAD2DEG,
    lat: (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * RAD2DEG
  }
}

/** Ground meters per mercator meter at a latitude (cos(lat)). */
export function groundScale(lat: number): number {
  return Math.cos(clampLatitude(lat) * DEG2RAD)
}

/** lon/lat -> ground meters (east, north) relative to a center. Accurate to well under 1% within a few km. */
export function lonLatToGround(lon: number, lat: number, centerLon: number, centerLat: number): GroundPoint {
  const p = lonLatToMercator(lon, lat)
  const c = lonLatToMercator(centerLon, centerLat)
  const k = groundScale(centerLat)
  return {x: (p.x - c.x) * k, y: (p.y - c.y) * k}
}

/** Ground meters (east, north) relative to a center -> lon/lat. */
export function groundToLonLat(east: number, north: number, centerLon: number, centerLat: number): {lon: number; lat: number} {
  const c = lonLatToMercator(centerLon, centerLat)
  const k = groundScale(centerLat)
  return mercatorToLonLat(c.x + east / k, c.y + north / k)
}

/** Fractional slippy-map tile coordinates of lon/lat at integer zoom z. */
export function lonLatToTile(lon: number, lat: number, z: number): {x: number; y: number} {
  const n = Math.pow(2, z)
  const l = clampLatitude(lat) * DEG2RAD
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2) * n
  }
}

/** Mercator meters spanned by one tile at zoom z. */
export function tileSizeMercator(z: number): number {
  return EARTH_CIRCUMFERENCE_M / Math.pow(2, z)
}

/** Ground meters per pixel for Mapbox GL styles (512 px tiles), e.g. the Static Images API. */
export function metersPerPixel512(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * groundScale(lat)) / (512 * Math.pow(2, zoom))
}

/** Static Images API zoom (fractional) so that `pixels` px cover `groundMeters` meters. */
export function zoomForCoverage(lat: number, groundMeters: number, pixels: number): number {
  const mpp = groundMeters / pixels
  return Math.log((EARTH_CIRCUMFERENCE_M * groundScale(lat)) / (512 * mpp)) / Math.LN2
}

/** Map scale: cm on the disc per ground meter. */
export function cmPerMeter(radiusMeters: number, mapSizeCm: number): number {
  return mapSizeCm / 2 / Math.max(1, radiusMeters)
}

/** Ground point (east, north) in meters -> local map position in cm (+X east, -Z north). */
export function groundToMapCm(p: GroundPoint, scale: number, y: number = 0): vec3 {
  return new vec3(p.x * scale, y, -p.y * scale)
}
