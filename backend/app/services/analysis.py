"""Deterministic accessibility analysis.

All user-facing accessibility metrics are computed here from areas, facilities,
a travel-time threshold, and a routing model. The intervention simulator and
candidate optimiser call the same functions; no displayed number is hard-coded
or produced by a language model.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.routing import (
    RoutingArea,
    RoutingFacility,
    RoutingModelInfo,
    TravelTimeRouter,
)

UNREACHABLE_SORT_KEY = 1_000_000.0


@dataclass(frozen=True)
class AnalysisArea:
    id: str
    name: str
    population: int | None
    vulnerability_index: float | None
    area_km2: float
    centroid_lon: float
    centroid_lat: float
    quadrant: str
    geometry: dict[str, Any]
    population_status: str = "unknown"
    population_reference_year: int | None = None
    municipality: str = ""

    @property
    def has_population(self) -> bool:
        return self.population is not None and self.population > 0


@dataclass(frozen=True)
class AnalysisFacility:
    id: str
    name: str
    facility_type: str
    services: tuple[str, ...]
    lon: float
    lat: float
    data_status: str = "synthetic"

    def to_routing(self) -> RoutingFacility:
        return RoutingFacility(
            id=self.id,
            name=self.name,
            lon=self.lon,
            lat=self.lat,
            services=self.services,
        )


@dataclass(frozen=True)
class AreaAccess:
    area: AnalysisArea
    travel_time_minutes: float | None
    nearest_facility_id: str | None
    nearest_facility_name: str | None
    suitable_facilities_within_threshold: int
    covered: bool

    def to_dict(self) -> dict[str, Any]:
        area = self.area
        return {
            "area_id": area.id,
            "name": area.name,
            "population": area.population,
            "population_status": area.population_status,
            "population_reference_year": area.population_reference_year,
            "vulnerability_index": area.vulnerability_index,
            "area_km2": area.area_km2,
            "centroid": [area.centroid_lon, area.centroid_lat],
            "quadrant": area.quadrant,
            "municipality": area.municipality,
            "population_included": area.has_population,
            "travel_time_minutes": (
                round(self.travel_time_minutes, 1)
                if self.travel_time_minutes is not None
                else None
            ),
            "nearest_facility_id": self.nearest_facility_id,
            "nearest_facility_name": self.nearest_facility_name,
            "suitable_facilities_within_threshold": self.suitable_facilities_within_threshold,
            "covered": self.covered,
        }


@dataclass(frozen=True)
class AccessSummary:
    service: str
    threshold_minutes: int
    total_population: int
    covered_population: int
    coverage_percent: float
    weighted_mean_travel_time: float | None
    weighted_median_travel_time: float | None
    weighted_p90_travel_time: float | None
    max_travel_time: float | None
    wards_total: int
    wards_over_threshold: int
    unreachable_wards: int
    suitable_facility_count: int
    distribution: list[dict[str, Any]]
    areas_total: int = 0
    areas_with_population: int = 0
    areas_without_population: int = 0
    areas_without_population_over_threshold: int = 0
    population_reference_year: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "service": self.service,
            "threshold_minutes": self.threshold_minutes,
            "total_population": self.total_population,
            "covered_population": self.covered_population,
            "coverage_percent": round(self.coverage_percent, 2),
            "weighted_mean_travel_time": _round_optional(self.weighted_mean_travel_time),
            "weighted_median_travel_time": _round_optional(self.weighted_median_travel_time),
            "weighted_p90_travel_time": _round_optional(self.weighted_p90_travel_time),
            "max_travel_time": _round_optional(self.max_travel_time),
            "wards_total": self.wards_total,
            "wards_over_threshold": self.wards_over_threshold,
            "unreachable_wards": self.unreachable_wards,
            "suitable_facility_count": self.suitable_facility_count,
            "distribution": self.distribution,
            "areas_total": self.areas_total,
            "areas_with_population": self.areas_with_population,
            "areas_without_population": self.areas_without_population,
            "areas_without_population_over_threshold": (
                self.areas_without_population_over_threshold
            ),
            "population_reference_year": self.population_reference_year,
        }


@dataclass(frozen=True)
class AccessibilityResult:
    service: str
    threshold_minutes: int
    areas: list[AreaAccess]
    summary: AccessSummary
    routing: RoutingModelInfo
    suitable_facilities: list[AnalysisFacility]


@dataclass(frozen=True)
class AreaComparison:
    area: AnalysisArea
    baseline_time: float | None
    proposed_time: float | None
    covered_baseline: bool
    covered_proposed: bool
    newly_covered_population: int
    improvement_minutes: float | None
    baseline_facility_id: str | None
    proposed_facility_id: str | None

    def to_dict(self) -> dict[str, Any]:
        area = self.area
        return {
            "area_id": area.id,
            "name": area.name,
            "population": area.population,
            "population_included": area.has_population,
            "vulnerability_index": area.vulnerability_index,
            "quadrant": area.quadrant,
            "municipality": area.municipality,
            "centroid": [area.centroid_lon, area.centroid_lat],
            "travel_time_baseline": _round_optional(self.baseline_time),
            "travel_time_proposed": _round_optional(self.proposed_time),
            "covered_baseline": self.covered_baseline,
            "covered_proposed": self.covered_proposed,
            "newly_covered_population": self.newly_covered_population,
            "improvement_minutes": _round_optional(self.improvement_minutes),
            "baseline_facility_id": self.baseline_facility_id,
            "proposed_facility_id": self.proposed_facility_id,
        }


@dataclass(frozen=True)
class EquitySummary:
    worst_served_population_share: float
    worst_served_area_count: int
    worst_served_population: int
    baseline_coverage_percent: float
    proposed_coverage_percent: float
    coverage_gain_percentage_points: float
    baseline_mean_travel_time: float | None
    proposed_mean_travel_time: float | None
    mean_travel_time_improvement: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "worst_served_population_share": self.worst_served_population_share,
            "worst_served_area_count": self.worst_served_area_count,
            "worst_served_population": self.worst_served_population,
            "baseline_coverage_percent": round(self.baseline_coverage_percent, 2),
            "proposed_coverage_percent": round(self.proposed_coverage_percent, 2),
            "coverage_gain_percentage_points": round(
                self.coverage_gain_percentage_points, 2
            ),
            "baseline_mean_travel_time": _round_optional(
                self.baseline_mean_travel_time
            ),
            "proposed_mean_travel_time": _round_optional(
                self.proposed_mean_travel_time
            ),
            "mean_travel_time_improvement": _round_optional(
                self.mean_travel_time_improvement
            ),
        }


@dataclass(frozen=True)
class ComparisonResult:
    baseline: AccessibilityResult
    proposed: AccessibilityResult
    areas: list[AreaComparison]
    newly_covered_population: int
    coverage_gain_percentage_points: float
    weighted_mean_travel_time_change: float | None
    weighted_median_travel_time_change: float | None
    wards_newly_covered: int
    wards_improved: int
    wards_worsened: int
    remaining_uncovered_population: int
    remaining_wards_over_threshold: int
    equity: EquitySummary

    def delta_dict(self) -> dict[str, Any]:
        return {
            "newly_covered_population": self.newly_covered_population,
            "coverage_gain_percentage_points": round(
                self.coverage_gain_percentage_points, 2
            ),
            "weighted_mean_travel_time_change": _round_optional(
                self.weighted_mean_travel_time_change
            ),
            "weighted_median_travel_time_change": _round_optional(
                self.weighted_median_travel_time_change
            ),
            "wards_newly_covered": self.wards_newly_covered,
            "wards_improved": self.wards_improved,
            "wards_worsened": self.wards_worsened,
            "remaining_uncovered_population": self.remaining_uncovered_population,
            "remaining_wards_over_threshold": self.remaining_wards_over_threshold,
        }


DISTRIBUTION_BOUNDS: tuple[tuple[float, float, str], ...] = (
    (0.0, 15.0, "0-15 min"),
    (15.0, 30.0, "15-30 min"),
    (30.0, 45.0, "30-45 min"),
    (45.0, 60.0, "45-60 min"),
    (60.0, 90.0, "60-90 min"),
    (90.0, float("inf"), "90+ min"),
)


def analyze(
    areas: list[AnalysisArea],
    facilities: list[AnalysisFacility],
    service: str,
    threshold_minutes: int,
    router: TravelTimeRouter,
) -> AccessibilityResult:
    if threshold_minutes <= 0:
        raise ValueError("Travel-time threshold must be positive")
    if not areas:
        raise ValueError("At least one area is required")
    if not 0 <= threshold_minutes <= 24 * 60:
        raise ValueError("Travel-time threshold is outside a supported range")

    suitable = [facility for facility in facilities if service in facility.services]
    routing_areas = [
        RoutingArea(id=area.id, centroid_lon=area.centroid_lon, centroid_lat=area.centroid_lat)
        for area in areas
    ]
    if suitable and hasattr(router, "travel_matrix_array"):
        access = _analyze_array(
            areas, suitable, routing_areas, threshold_minutes, router
        )
    else:
        if suitable:
            matrix = router.travel_matrix(
                routing_areas, [facility.to_routing() for facility in suitable]
            )
        else:
            matrix = {area.id: {} for area in areas}
        access = _analyze_dicts(areas, suitable, matrix, threshold_minutes)

    summary = summarize(access, service, threshold_minutes, len(suitable))
    return AccessibilityResult(
        service=service,
        threshold_minutes=threshold_minutes,
        areas=access,
        summary=summary,
        routing=router.model_info,
        suitable_facilities=suitable,
    )


def _analyze_dicts(
    areas: list[AnalysisArea],
    suitable: list[AnalysisFacility],
    matrix: dict[str, dict[str, float]],
    threshold_minutes: int,
) -> list[AreaAccess]:
    by_id = {facility.id: facility for facility in suitable}
    access: list[AreaAccess] = []
    for area in areas:
        times = matrix.get(area.id, {})
        if times:
            nearest_id = min(times, key=lambda facility_id: (times[facility_id], facility_id))
            nearest_time = times[nearest_id]
            nearest = by_id[nearest_id]
            within = sum(1 for value in times.values() if value <= threshold_minutes)
            access.append(
                AreaAccess(
                    area=area,
                    travel_time_minutes=nearest_time,
                    nearest_facility_id=nearest.id,
                    nearest_facility_name=nearest.name,
                    suitable_facilities_within_threshold=within,
                    covered=nearest_time <= threshold_minutes,
                )
            )
        else:
            access.append(
                AreaAccess(
                    area=area,
                    travel_time_minutes=None,
                    nearest_facility_id=None,
                    nearest_facility_name=None,
                    suitable_facilities_within_threshold=0,
                    covered=False,
                )
            )
    return access


def _analyze_array(
    areas: list[AnalysisArea],
    suitable: list[AnalysisFacility],
    routing_areas: list[RoutingArea],
    threshold_minutes: int,
    router: TravelTimeRouter,
) -> list[AreaAccess]:
    """Vectorised equivalent of the dictionary path for packaged road networks."""
    import numpy as np

    values = np.asarray(
        router.travel_matrix_array(  # type: ignore[attr-defined]
            routing_areas, [facility.to_routing() for facility in suitable]
        ),
        dtype=float,
    )
    finite = np.isfinite(values)
    has_any = finite.any(axis=1)
    masked = np.where(finite, values, np.inf)
    nearest_index = np.argmin(masked, axis=1)
    nearest_time = np.where(
        has_any,
        masked[np.arange(len(areas)), nearest_index],
        np.inf,
    )
    within = (values <= threshold_minutes).sum(axis=1)
    access: list[AreaAccess] = []
    for position, area in enumerate(areas):
        if not has_any[position]:
            access.append(
                AreaAccess(
                    area=area,
                    travel_time_minutes=None,
                    nearest_facility_id=None,
                    nearest_facility_name=None,
                    suitable_facilities_within_threshold=0,
                    covered=False,
                )
            )
            continue
        facility = suitable[int(nearest_index[position])]
        access.append(
            AreaAccess(
                area=area,
                travel_time_minutes=float(nearest_time[position]),
                nearest_facility_id=facility.id,
                nearest_facility_name=facility.name,
                suitable_facilities_within_threshold=int(within[position]),
                covered=bool(nearest_time[position] <= threshold_minutes),
            )
        )
    return access


def summarize(
    access: list[AreaAccess],
    service: str,
    threshold_minutes: int,
    suitable_facility_count: int,
) -> AccessSummary:
    # Areas without a valid population value are still analysed for travel time
    # but are excluded from every population denominator. They are reported
    # explicitly rather than being treated as zero.
    included = [item for item in access if item.area.has_population]
    excluded = [item for item in access if not item.area.has_population]
    total_population = sum(item.area.population or 0 for item in included)
    covered_population = sum(
        item.area.population or 0 for item in included if item.covered
    )
    coverage_percent = (
        (covered_population / total_population) * 100 if total_population else 0.0
    )

    finite = [
        (item.travel_time_minutes, item.area.population or 0)
        for item in included
        if item.travel_time_minutes is not None
    ]
    weighted_mean = _weighted_mean(finite)
    weighted_median = _weighted_percentile(finite, 0.5)
    weighted_p90 = _weighted_percentile(finite, 0.9)
    max_time = max((value for value, _ in finite), default=None)
    unreachable = sum(1 for item in included if item.travel_time_minutes is None)
    over_threshold = sum(1 for item in included if not item.covered)

    distribution = []
    for lower, upper, label in DISTRIBUTION_BOUNDS:
        matching = [
            item
            for item in included
            if item.travel_time_minutes is not None
            and item.travel_time_minutes >= lower
            and item.travel_time_minutes < upper
        ]
        distribution.append(
            {
                "bucket": label,
                "areas": len(matching),
                "population": sum(item.area.population or 0 for item in matching),
            }
        )
    unreachable_population = sum(
        item.area.population or 0
        for item in included
        if item.travel_time_minutes is None
    )
    distribution.append(
        {
            "bucket": "No suitable facility",
            "areas": unreachable,
            "population": unreachable_population,
        }
    )

    reference_years = sorted(
        {
            item.area.population_reference_year
            for item in included
            if item.area.population_reference_year is not None
        }
    )
    reference_year = reference_years[-1] if len(reference_years) == 1 else None

    return AccessSummary(
        service=service,
        threshold_minutes=threshold_minutes,
        total_population=total_population,
        covered_population=covered_population,
        coverage_percent=coverage_percent,
        weighted_mean_travel_time=weighted_mean,
        weighted_median_travel_time=weighted_median,
        weighted_p90_travel_time=weighted_p90,
        max_travel_time=max_time,
        wards_total=len(included),
        wards_over_threshold=over_threshold,
        unreachable_wards=unreachable,
        suitable_facility_count=suitable_facility_count,
        distribution=distribution,
        areas_total=len(access),
        areas_with_population=len(included),
        areas_without_population=len(excluded),
        areas_without_population_over_threshold=sum(
            1 for item in excluded if not item.covered
        ),
        population_reference_year=reference_year,
    )


def compare_access(
    baseline: AccessibilityResult,
    proposed: AccessibilityResult,
    worst_share: float = 0.2,
) -> ComparisonResult:
    if baseline.service != proposed.service:
        raise ValueError("Baseline and proposed analyses use different services")
    if baseline.threshold_minutes != proposed.threshold_minutes:
        raise ValueError("Baseline and proposed analyses use different thresholds")

    proposed_by_id = {item.area.id: item for item in proposed.areas}
    comparisons: list[AreaComparison] = []
    newly_covered = 0
    wards_newly_covered = 0
    wards_improved = 0
    wards_worsened = 0

    for base in baseline.areas:
        prop = proposed_by_id[base.area.id]
        became_covered = prop.covered and not base.covered
        if became_covered:
            newly_covered += base.area.population or 0
            if base.area.has_population:
                wards_newly_covered += 1
        improvement: float | None = None
        if base.travel_time_minutes is not None and prop.travel_time_minutes is not None:
            improvement = base.travel_time_minutes - prop.travel_time_minutes
            if improvement > 0.05:
                wards_improved += 1
            elif improvement < -0.05:
                wards_worsened += 1
        elif base.travel_time_minutes is None and prop.travel_time_minutes is not None:
            wards_improved += 1
        comparisons.append(
            AreaComparison(
                area=base.area,
                baseline_time=base.travel_time_minutes,
                proposed_time=prop.travel_time_minutes,
                covered_baseline=base.covered,
                covered_proposed=prop.covered,
                newly_covered_population=(base.area.population or 0) if became_covered else 0,
                improvement_minutes=improvement,
                baseline_facility_id=base.nearest_facility_id,
                proposed_facility_id=prop.nearest_facility_id,
            )
        )

    coverage_gain = (
        proposed.summary.coverage_percent - baseline.summary.coverage_percent
    )
    mean_change = _difference(
        proposed.summary.weighted_mean_travel_time,
        baseline.summary.weighted_mean_travel_time,
    )
    median_change = _difference(
        proposed.summary.weighted_median_travel_time,
        baseline.summary.weighted_median_travel_time,
    )
    equity = compute_equity(baseline, proposed, worst_share=worst_share)

    return ComparisonResult(
        baseline=baseline,
        proposed=proposed,
        areas=comparisons,
        newly_covered_population=newly_covered,
        coverage_gain_percentage_points=coverage_gain,
        weighted_mean_travel_time_change=mean_change,
        weighted_median_travel_time_change=median_change,
        wards_newly_covered=wards_newly_covered,
        wards_improved=wards_improved,
        wards_worsened=wards_worsened,
        remaining_uncovered_population=(
            proposed.summary.total_population - proposed.summary.covered_population
        ),
        remaining_wards_over_threshold=proposed.summary.wards_over_threshold,
        equity=equity,
    )


def compute_equity(
    baseline: AccessibilityResult,
    proposed: AccessibilityResult,
    worst_share: float = 0.2,
) -> EquitySummary:
    """Compare access for the population with the longest baseline travel times.

    The worst-served group is built by sorting areas from longest to shortest
    baseline travel time and taking areas until the cumulative population reaches
    the requested share. Unreachable areas sort first. This is a transparent,
    reproducible definition; it is not an official equity standard.
    """
    if not 0 < worst_share <= 1:
        raise ValueError("Worst-served population share must be between 0 and 1")

    included = [item for item in baseline.areas if item.area.has_population]
    ordered = sorted(
        included,
        key=lambda item: (
            -(item.travel_time_minutes
              if item.travel_time_minutes is not None
              else UNREACHABLE_SORT_KEY),
            item.area.id,
        ),
    )
    total = baseline.summary.total_population
    target = total * worst_share
    selected: list[str] = []
    cumulative = 0
    for item in ordered:
        selected.append(item.area.id)
        cumulative += item.area.population or 0
        if cumulative >= target:
            break
    if not selected and ordered:
        selected = [ordered[0].area.id]

    selected_set = set(selected)
    base_group = [item for item in baseline.areas if item.area.id in selected_set]
    prop_by_id = {item.area.id: item for item in proposed.areas}
    prop_group = [prop_by_id[item.area.id] for item in base_group]

    group_population = sum(item.area.population or 0 for item in base_group)
    base_covered = sum(item.area.population or 0 for item in base_group if item.covered)
    prop_covered = sum(item.area.population or 0 for item in prop_group if item.covered)
    base_cov_pct = (base_covered / group_population * 100) if group_population else 0.0
    prop_cov_pct = (prop_covered / group_population * 100) if group_population else 0.0
    base_mean = _population_weighted_mean_time(base_group)
    prop_mean = _population_weighted_mean_time(prop_group)

    return EquitySummary(
        worst_served_population_share=worst_share,
        worst_served_area_count=len(base_group),
        worst_served_population=group_population,
        baseline_coverage_percent=base_cov_pct,
        proposed_coverage_percent=prop_cov_pct,
        coverage_gain_percentage_points=prop_cov_pct - base_cov_pct,
        baseline_mean_travel_time=base_mean,
        proposed_mean_travel_time=prop_mean,
        mean_travel_time_improvement=(
            base_mean - prop_mean if base_mean is not None and prop_mean is not None else None
        ),
    )


def _population_weighted_mean_time(access: list[AreaAccess]) -> float | None:
    finite = [
        (item.travel_time_minutes, item.area.population or 0)
        for item in access
        if item.travel_time_minutes is not None and item.area.has_population
    ]
    return _weighted_mean(finite)


def _weighted_mean(values: list[tuple[float, int]]) -> float | None:
    total_weight = sum(weight for _, weight in values)
    if total_weight <= 0:
        return None
    return sum(value * weight for value, weight in values) / total_weight


def _weighted_percentile(values: list[tuple[float, int]], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values, key=lambda pair: pair[0])
    total_weight = sum(weight for _, weight in ordered)
    if total_weight <= 0:
        return None
    target = total_weight * quantile
    cumulative = 0
    for value, weight in ordered:
        cumulative += weight
        if cumulative >= target:
            return value
    return ordered[-1][0]


def _difference(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return a - b


def _round_optional(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None
