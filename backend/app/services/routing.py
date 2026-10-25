"""Travel-time estimation over an explicit road network.

The demo uses a synthetic street grid. The router is deliberately isolated
behind the :class:`TravelTimeRouter` protocol so that a production deployment
can substitute a real routing engine (for example a self-hosted OSRM/Valhalla
instance) without changing the accessibility model.

A straight-line fallback is provided for environments where the road network
cannot be loaded. It applies a documented detour factor and must never be
described as actual road travel time.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

import networkx as nx

from app.services.geo import haversine_km, to_utm

logger = logging.getLogger(__name__)

LOCAL_ACCESS_SPEED_KPH = 18.0
FALLBACK_SPEED_KPH = 28.0
FALLBACK_DETOUR_FACTOR = 1.35


class RouterUnavailableError(RuntimeError):
    """Raised when the configured road network cannot be used."""


@dataclass(frozen=True)
class RoutingModelInfo:
    id: str
    label: str
    description: str
    is_estimate: bool = True
    live_traffic: bool = False
    warnings: tuple[str, ...] = ()


@dataclass
class RoutingArea:
    id: str
    centroid_lon: float
    centroid_lat: float


@dataclass
class RoutingFacility:
    id: str
    name: str
    lon: float
    lat: float
    services: tuple[str, ...]


class TravelTimeRouter(Protocol):
    model_info: RoutingModelInfo

    def travel_matrix(
        self, areas: list[RoutingArea], facilities: list[RoutingFacility]
    ) -> dict[str, dict[str, float]]:
        """Return area_id -> {facility_id: estimated travel minutes}."""


@dataclass
class SyntheticRoadRouter:
    graph: nx.Graph
    node_xy: dict[str, tuple[float, float]]
    model_info: RoutingModelInfo
    _facility_cache: dict[str, dict[str, float]] = field(default_factory=dict, init=False)
    _area_access_cache: dict[tuple[float, float], tuple[str, float]] = field(
        default_factory=dict, init=False
    )

    @classmethod
    def from_geojson(
        cls, roads: dict, model_info: RoutingModelInfo | None = None
    ) -> SyntheticRoadRouter:
        graph = nx.Graph()
        node_xy: dict[str, tuple[float, float]] = {}
        for feature in roads.get("features", []):
            props = feature.get("properties") or {}
            geometry = feature.get("geometry") or {}
            coords = geometry.get("coordinates") or []
            if len(coords) < 2:
                continue
            from_node = str(props.get("from_node", ""))
            to_node = str(props.get("to_node", ""))
            if not from_node or not to_node:
                continue
            length_km = float(props.get("length_km") or 0.0)
            speed_kph = float(props.get("speed_kph") or 0.0)
            if length_km <= 0 or speed_kph <= 0:
                continue
            minutes = (length_km / speed_kph) * 60.0
            lon1, lat1 = coords[0][:2]
            lon2, lat2 = coords[-1][:2]
            x1, y1 = to_utm(float(lon1), float(lat1))
            x2, y2 = to_utm(float(lon2), float(lat2))
            node_xy[from_node] = (x1, y1)
            node_xy[to_node] = (x2, y2)
            if from_node != to_node:
                graph.add_edge(from_node, to_node, minutes=minutes, length_km=length_km)

        if graph.number_of_nodes() < 10 or graph.number_of_edges() < 10:
            raise RouterUnavailableError("Road network has too few nodes or edges")

        components = list(nx.connected_components(graph))
        if len(components) > 1:
            largest = max(components, key=len)
            if len(largest) < graph.number_of_nodes() * 0.95:
                raise RouterUnavailableError("Road network is fragmented")
            graph = graph.subgraph(largest).copy()
            node_xy = {node: node_xy[node] for node in graph.nodes}

        info = model_info or RoutingModelInfo(
            id="synthetic_grid",
            label="Synthetic street-grid estimate",
            description=(
                "Travel times come from shortest paths over a synthetic 2.0 km road grid "
                "with plausible speed classes. This is not live traffic and not a real "
                "turn-by-turn routing service."
            ),
            warnings=(
                "Travel times are model estimates, not live traffic.",
                "The road network is synthetic and does not reflect real road conditions.",
                "Facility opening hours, queues, and capacity are not included.",
            ),
        )
        return cls(graph=graph, node_xy=node_xy, model_info=info)

    def _nearest_node(self, lon: float, lat: float) -> tuple[str, float]:
        key = (round(lon, 6), round(lat, 6))
        if key in self._area_access_cache:
            return self._area_access_cache[key]
        x, y = to_utm(lon, lat)
        best_node: str | None = None
        best_distance = float("inf")
        for node, (nx_, ny_) in self.node_xy.items():
            distance = (nx_ - x) ** 2 + (ny_ - y) ** 2
            if distance < best_distance:
                best_distance = distance
                best_node = node
        if best_node is None:
            raise RouterUnavailableError("No road nodes available")
        access_minutes = (best_distance**0.5 / 1000.0) / LOCAL_ACCESS_SPEED_KPH * 60.0
        result = (best_node, access_minutes)
        if len(self._area_access_cache) < 50_000:
            self._area_access_cache[key] = result
        return result

    def facility_node_times(self, facility: RoutingFacility) -> dict[str, float]:
        key = f"{facility.id}:{facility.lon:.6f}:{facility.lat:.6f}"
        cached = self._facility_cache.get(key)
        if cached is not None:
            return cached
        node, access_minutes = self._nearest_node(facility.lon, facility.lat)
        raw = nx.single_source_dijkstra_path_length(self.graph, node, weight="minutes")
        times = {node_id: minutes + access_minutes for node_id, minutes in raw.items()}
        self._facility_cache[key] = times
        return times

    def travel_matrix(
        self, areas: list[RoutingArea], facilities: list[RoutingFacility]
    ) -> dict[str, dict[str, float]]:
        facility_times = {
            facility.id: self.facility_node_times(facility) for facility in facilities
        }
        matrix: dict[str, dict[str, float]] = {}
        for area in areas:
            node, access_minutes = self._nearest_node(area.centroid_lon, area.centroid_lat)
            times: dict[str, float] = {}
            for facility in facilities:
                node_times = facility_times[facility.id]
                if node in node_times:
                    times[facility.id] = round(node_times[node] + access_minutes, 3)
            matrix[area.id] = times
        return matrix


@dataclass
class StraightLineFallbackRouter:
    """Documented fallback used only when no road network is available."""

    model_info: RoutingModelInfo = field(
        default_factory=lambda: RoutingModelInfo(
            id="straight_line_fallback",
            label="Straight-line fallback estimate",
            description=(
                "Road data was unavailable, so travel time is approximated from "
                f"straight-line distance × {FALLBACK_DETOUR_FACTOR} at an assumed "
                f"{FALLBACK_SPEED_KPH:.0f} km/h. This is NOT actual road travel time."
            ),
            warnings=(
                "Fallback mode: no road network was loaded.",
                "Straight-line distances overstate accessibility; treat results as lower bounds on travel time.",
            ),
        )
    )

    def travel_matrix(
        self, areas: list[RoutingArea], facilities: list[RoutingFacility]
    ) -> dict[str, dict[str, float]]:
        matrix: dict[str, dict[str, float]] = {}
        for area in areas:
            times = {}
            for facility in facilities:
                distance = haversine_km(
                    area.centroid_lon,
                    area.centroid_lat,
                    facility.lon,
                    facility.lat,
                )
                times[facility.id] = round(
                    (distance * FALLBACK_DETOUR_FACTOR / FALLBACK_SPEED_KPH) * 60.0, 3
                )
            matrix[area.id] = times
        return matrix


@dataclass
class NetworkRoadRouter:
    """Shortest-path travel times over a packaged OpenStreetMap road graph.

    The graph, node coordinates, and a precomputed facility-to-area matrix are
    shipped with the dataset release. New facilities (proposed interventions or
    validated imports) are snapped to the same graph and evaluated with a
    single-source Dijkstra run on demand. The router never invents a fallback:
    if the packaged network cannot be loaded, the application refuses to start.
    """

    graph: Any
    node_lon: Any
    node_lat: Any
    node_utm: Any
    tree: Any
    area_snaps: dict[str, tuple[int, float]]
    facility_snaps: dict[str, tuple[int, float]]
    facility_ids: list[str]
    area_ids: list[str]
    matrix: Any
    area_distance: Any
    model_info: RoutingModelInfo
    _facility_positions: dict[str, int] = field(default_factory=dict, init=False)
    _area_positions: dict[str, int] = field(default_factory=dict, init=False)
    _centroid_positions: dict[tuple[float, float], int] = field(
        default_factory=dict, init=False
    )
    _area_lon: Any = None
    _area_lat: Any = None
    _facility_cache: dict[str, dict[str, float]] = field(default_factory=dict, init=False)
    _area_cache: dict[str, dict[str, float]] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self._facility_positions = {
            facility_id: index for index, facility_id in enumerate(self.facility_ids)
        }
        self._area_positions = {
            area_id: index for index, area_id in enumerate(self.area_ids)
        }
        if self._area_lon is not None and self._area_lat is not None:
            self._centroid_positions = {
                (round(float(lon), 6), round(float(lat), 6)): index
                for index, (lon, lat) in enumerate(
                    zip(self._area_lon, self._area_lat, strict=False)
                )
            }

    @classmethod
    def from_npz(
        cls, path: Path, model_info: RoutingModelInfo | None = None
    ) -> NetworkRoadRouter:
        try:
            import numpy as np
            from scipy.sparse import csr_matrix
            from scipy.spatial import cKDTree
        except ImportError as exc:  # pragma: no cover - operator environment
            raise RouterUnavailableError(
                "The Delhi network router requires NumPy and SciPy. "
                "Install with: pip install -r backend/requirements.txt"
            ) from exc
        try:
            with np.load(path, allow_pickle=False) as payload:
                graph = csr_matrix(
                    (
                        payload["data"].astype(float),
                        payload["indices"].astype(int),
                        payload["indptr"].astype(int),
                    )
                )
                node_lon = payload["node_lon"].astype(float)
                node_lat = payload["node_lat"].astype(float)
                area_node = payload["area_node"].astype(int)
                area_access = payload["area_access"].astype(float)
                facility_node = payload["facility_node"].astype(int)
                facility_access = payload["facility_access"].astype(float)
                travel = payload["travel_minutes"].astype(float)
                area_distance = payload["area_distance"].astype(float)
                area_lon = payload["area_lon"].astype(float)
                area_lat = payload["area_lat"].astype(float)
                area_ids = [str(value) for value in payload["area_ids"]]
                facility_ids = [str(value) for value in payload["facility_ids"]]
        except (OSError, KeyError, ValueError) as exc:
            raise RouterUnavailableError(
                f"Packaged road network at {path} could not be read: {exc}"
            ) from exc

        if graph.shape[0] != node_lon.shape[0] or graph.shape[0] != node_lat.shape[0]:
            raise RouterUnavailableError("Road graph node arrays are inconsistent")
        if travel.shape != (len(area_ids), len(facility_ids)):
            raise RouterUnavailableError("Travel-time matrix shape does not match its identifiers")
        if area_distance.shape != (len(area_ids), len(area_ids)):
            raise RouterUnavailableError("Area-to-area matrix shape is inconsistent")
        if graph.nnz < 1000:
            raise RouterUnavailableError("Road graph has too few edges")

        x, y = _to_utm_arrays(node_lon, node_lat)
        node_utm = np.column_stack((x, y))
        info = model_info or RoutingModelInfo(
            id="osm_network",
            label="OpenStreetMap road-network estimate",
            description=(
                "Travel time is the shortest path over an OpenStreetMap drivable "
                "road graph using documented road-class speeds and a local-access "
                "estimate. It is not live traffic, public transport, or turn-by-turn routing."
            ),
            warnings=(
                "Travel times are model estimates, not live traffic.",
                "One-way restrictions, turn restrictions, and congestion are not modelled.",
                "Facility opening hours, queues, capacity, and staffing are not included.",
            ),
        )
        return cls(
            graph=graph,
            node_lon=node_lon,
            node_lat=node_lat,
            node_utm=node_utm,
            tree=cKDTree(node_utm),
            area_snaps={
                area_ids[index]: (int(area_node[index]), float(area_access[index]))
                for index in range(len(area_ids))
            },
            facility_snaps={
                facility_ids[index]: (
                    int(facility_node[index]),
                    float(facility_access[index]),
                )
                for index in range(len(facility_ids))
            },
            facility_ids=facility_ids,
            area_ids=area_ids,
            matrix=travel,
            area_distance=area_distance,
            model_info=info,
            _area_lon=area_lon,
            _area_lat=area_lat,
        )

    @property
    def area_snap(self) -> dict[str, tuple[int, float]]:
        return self.area_snaps

    def _snap(self, lon: float, lat: float) -> tuple[int, float]:
        x, y = to_utm(float(lon), float(lat))
        distance, node = self.tree.query([x, y], k=1)
        distance_km = float(distance) / 1000.0 * 1.25
        return int(node), distance_km / 15.0 * 60.0

    def _single_source(self, node: int) -> Any:
        from scipy.sparse.csgraph import dijkstra

        distances = dijkstra(self.graph, directed=False, indices=node)
        if distances.ndim > 1:
            distances = distances[0]
        return distances

    def _facility_column(self, facility: RoutingFacility) -> dict[str, float]:
        cached = self._facility_cache.get(facility.id)
        if cached is not None:
            return cached
        known = self.facility_snaps.get(facility.id)
        if known is not None:
            index = self._facility_positions[facility.id]
            column = {
                area_id: float(self.matrix[position, index])
                for position, area_id in enumerate(self.area_ids)
                if float(self.matrix[position, index]) < float("inf")
            }
        else:
            node, access = self._snap(facility.lon, facility.lat)
            centroid_index = self._centroid_positions.get(
                (round(float(facility.lon), 6), round(float(facility.lat), 6))
            )
            centroid_row = None
            if centroid_index is not None and self.area_distance is not None:
                centroid_row = self.area_distance[centroid_index]
            else:
                distances = self._single_source(node)
            column = {}
            for area_id, (area_node, area_access) in self.area_snaps.items():
                if centroid_row is not None:
                    value = float(centroid_row[self._area_positions[area_id]])
                else:
                    value = float(distances[area_node])
                if value < float("inf"):
                    column[area_id] = round(value + access + area_access, 3)
        if len(self._facility_cache) < 20_000:
            self._facility_cache[facility.id] = column
        return column

    def _area_column(self, area: RoutingArea) -> dict[str, float]:
        cached = self._area_cache.get(area.id)
        if cached is not None:
            return cached
        node, access = self._snap(area.centroid_lon, area.centroid_lat)
        distances = self._single_source(node)
        column: dict[str, float] = {}
        for facility_id, (facility_node, facility_access) in self.facility_snaps.items():
            value = float(distances[facility_node])
            if value < float("inf"):
                column[facility_id] = round(value + access + facility_access, 3)
        if len(self._area_cache) < 5_000:
            self._area_cache[area.id] = column
        return column

    def travel_matrix_array(
        self, areas: list[RoutingArea], facilities: list[RoutingFacility]
    ) -> Any:
        """Return a float matrix of shape (areas, facilities) for fast analysis."""
        import numpy as np

        row_positions = [self._area_positions.get(area.id) for area in areas]
        column_positions = [
            self._facility_positions.get(facility.id) for facility in facilities
        ]
        values = np.full((len(areas), len(facilities)), np.inf, dtype=np.float32)
        known_rows = [index for index, value in enumerate(row_positions) if value is not None]
        known_columns = [
            index for index, value in enumerate(column_positions) if value is not None
        ]
        if known_rows and known_columns:
            values[np.ix_(known_rows, known_columns)] = self.matrix[
                np.ix_(
                    [row_positions[index] for index in known_rows],
                    [column_positions[index] for index in known_columns],
                )
            ]
        for column, facility in enumerate(facilities):
            if column_positions[column] is not None:
                continue
            column_times = self._facility_column(facility)
            for row, area in enumerate(areas):
                value = column_times.get(area.id)
                if value is not None:
                    values[row, column] = value
        for row, area in enumerate(areas):
            if row_positions[row] is not None:
                continue
            row_times = self._area_column(area)
            for column, facility in enumerate(facilities):
                value = row_times.get(facility.id)
                if value is not None:
                    values[row, column] = value
        return values

    def travel_matrix(
        self, areas: list[RoutingArea], facilities: list[RoutingFacility]
    ) -> dict[str, dict[str, float]]:
        matrix: dict[str, dict[str, float]] = {}
        for area in areas:
            area_position = self._area_positions.get(area.id)
            if area_position is not None:
                times: dict[str, float] = {}
                row = self.matrix[area_position]
                for facility in facilities:
                    facility_position = self._facility_positions.get(facility.id)
                    if facility_position is None:
                        value = self._facility_column(facility).get(area.id)
                    else:
                        value = float(row[facility_position])
                    if value is not None and value < float("inf"):
                        times[facility.id] = value
                matrix[area.id] = times
            else:
                # An imported or otherwise unknown area: one Dijkstra run from
                # the area node yields its times to every mapped facility node.
                times = dict(self._area_column(area))
                for facility in facilities:
                    if facility.id not in times:
                        value = self._facility_column(facility).get(area.id)
                        if value is not None:
                            times[facility.id] = value
                matrix[area.id] = times
        return matrix


def _to_utm_arrays(lon: Any, lat: Any) -> tuple[Any, Any]:
    from pyproj import Transformer

    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
    return transformer.transform(lon, lat)


def build_router(roads_path: Path | None = None) -> TravelTimeRouter:
    default_path = (
        Path(__file__).resolve().parents[1] / "data" / "demo" / "roads.geojson"
    )
    path = roads_path or default_path
    try:
        with path.open(encoding="utf-8") as handle:
            roads = json.load(handle)
        return SyntheticRoadRouter.from_geojson(roads)
    except (OSError, ValueError, KeyError, RouterUnavailableError) as exc:
        logger.warning(
            "Falling back to straight-line travel estimates because the road network "
            "could not be loaded: %s",
            exc,
        )
        return StraightLineFallbackRouter()
