import type { Geometry, Position } from "geojson";

function pointInRing(point: [number, number], ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], rings: Position[][]): boolean {
  if (!rings.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

export function pointInGeometry(
  lon: number,
  lat: number,
  geometry: Geometry,
): boolean {
  const point: [number, number] = [lon, lat];
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

export function pointInAreas(
  lon: number,
  lat: number,
  areas: Array<{ geometry: Geometry }>,
): boolean {
  return areas.some((area) => pointInGeometry(lon, lat, area.geometry));
}
