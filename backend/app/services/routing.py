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
from typing import Protocol

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
