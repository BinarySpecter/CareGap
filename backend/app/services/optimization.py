"""Deterministic candidate-location ranking and greedy facility selection.

This is a heuristic decision-support tool, not a proven globally optimal
solution. Candidates are the centroids of population areas. Each candidate is
evaluated by re-running the same accessibility analysis used elsewhere.

Composite score (default equity_weight=0.35):

    coverage_component = newly covered population / best candidate value
    equity_component   = vulnerability-weighted newly covered population / best value
    travel_component   = person-minutes saved / best value

    score = (1 - equity_weight) * coverage_component
          + equity_weight * (0.75 * equity_component + 0.25 * travel_component)

A 10% concentration penalty is applied when a candidate is placed in an area
that is already within the threshold. Normalisation uses each metric's maximum
candidate value rather than min-max scaling so components stay in [0, 1].
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.core.catalog import INTERVENTION_BY_ID
from app.services.analysis import (
    AccessibilityResult,
    AnalysisArea,
    AnalysisFacility,
    analyze,
)
from app.services.routing import TravelTimeRouter

CONCENTRATION_PENALTY = 0.10
EQUITY_BLOCK_EQUITY_WEIGHT = 0.75
EQUITY_BLOCK_TRAVEL_WEIGHT = 0.25

Strategy = Literal["equity_weighted", "max_coverage"]


@dataclass(frozen=True)
class CandidateMetrics:
    area: AnalysisArea
    result: AccessibilityResult
    newly_covered_population: int
    newly_covered_areas: int
    vulnerability_weighted_gain: float
    person_minutes_saved: float
    mean_travel_time_change: float | None
    already_covered: bool
    beneficiary_areas: list[dict[str, Any]]
    residual_areas: list[dict[str, Any]]


@dataclass
class RankedCandidate:
    metrics: CandidateMetrics
    score: float
    coverage_component: float
    equity_component: float
    travel_component: float
    concentration_penalty: float
    coverage_rank: int
    explanation: str


def recommend(
    areas: list[AnalysisArea],
    facilities: list[AnalysisFacility],
    service: str,
    threshold_minutes: int,
    router: TravelTimeRouter,
    intervention_type: str,
    equity_weight: float = 0.35,
    limit: int = 10,
    set_size: int = 3,
    strategy: Strategy = "equity_weighted",
) -> dict[str, Any]:
    if not 0.0 <= equity_weight <= 1.0:
        raise ValueError("equity_weight must be between 0 and 1")
    if not 1 <= limit <= 50:
        raise ValueError("limit must be between 1 and 50")
    if not 1 <= set_size <= 5:
        raise ValueError("set_size must be between 1 and 5")
    if strategy not in ("equity_weighted", "max_coverage"):
        raise ValueError("Unknown strategy")

    # Population-less areas cannot contribute to coverage or equity gains.
    areas = [area for area in areas if area.has_population]
    if not areas:
        raise ValueError("No population areas with valid population data are available")
    vulnerability_available = any(area.vulnerability_index is not None for area in areas)

    definition = INTERVENTION_BY_ID.get(intervention_type)
    if definition is None:
        raise ValueError("Unknown intervention type")
    if service not in definition["services"]:
        raise ValueError(
            f"{definition['label']} is not modelled as providing {service}"
        )

    baseline = analyze(areas, facilities, service, threshold_minutes, router)
    metrics = [
        evaluate_candidate(
            area=area,
            areas=areas,
            baseline_facilities=facilities,
            baseline=baseline,
            service=service,
            threshold_minutes=threshold_minutes,
            router=router,
            intervention_type=intervention_type,
            intervention_label=str(definition["label"]),
        )
        for area in areas
    ]
    max_coverage = max((item.newly_covered_population for item in metrics), default=0)
    max_equity = max((item.vulnerability_weighted_gain for item in metrics), default=0.0)
    max_travel = max((item.person_minutes_saved for item in metrics), default=0.0)

    scored: list[RankedCandidate] = []
    for area_metrics in metrics:
        coverage_component = _norm(area_metrics.newly_covered_population, max_coverage)
        equity_component = _norm(area_metrics.vulnerability_weighted_gain, max_equity)
        travel_component = _norm(area_metrics.person_minutes_saved, max_travel)
        penalty = CONCENTRATION_PENALTY if area_metrics.already_covered else 0.0
        score = _composite(
            coverage_component, equity_component, travel_component, penalty, equity_weight
        )
        scored.append(
            RankedCandidate(
                metrics=area_metrics,
                score=score,
                coverage_component=coverage_component,
                equity_component=equity_component,
                travel_component=travel_component,
                concentration_penalty=penalty,
                coverage_rank=1
                + sum(
                    1
                    for other in metrics
                    if other.newly_covered_population
                    > area_metrics.newly_covered_population
                ),
                explanation="",
            )
        )

    scored.sort(
        key=lambda item: (
            -item.score,
            -item.metrics.newly_covered_population,
            -item.metrics.vulnerability_weighted_gain,
            item.metrics.area.id,
        )
    )
    top = scored[:limit]
    for item in top:
        item.explanation = _candidate_explanation(  # type: ignore[misc]
            item,
            threshold_minutes=threshold_minutes,
            baseline=baseline,
            intervention_label=str(definition["label"]),
        )

    both_sets = {
        "max_coverage": _greedy_set(
            areas=areas,
            facilities=facilities,
            service=service,
            threshold_minutes=threshold_minutes,
            router=router,
            intervention_type=intervention_type,
            intervention_label=str(definition["label"]),
            set_size=set_size,
            equity_weight=0.0,
            strategy="max_coverage",
        ),
        "equity_weighted": _greedy_set(
            areas=areas,
            facilities=facilities,
            service=service,
            threshold_minutes=threshold_minutes,
            router=router,
            intervention_type=intervention_type,
            intervention_label=str(definition["label"]),
            set_size=set_size,
            equity_weight=(
                max(equity_weight, 0.05) if vulnerability_available else 0.0
            ),
            strategy="equity_weighted",
        ),
    }
    recommended_set = both_sets[strategy]

    limitations = [
        "Candidate sites are population-area centroids, not parcel-level land availability.",
        "The composite score normalises each component by its best candidate; weights are judgement-based and configurable.",
        "Travel-time coverage ignores facility capacity, staffing, opening hours, cost, and quality of care.",
        "The greedy set is a heuristic, not a globally optimal solution.",
        "The demo dataset, travel-time model, and vulnerability index are synthetic; results are illustrative only.",
    ]
    if not vulnerability_available:
        limitations = [
            item
            for item in limitations
            if "vulnerability index are synthetic" not in item
        ]
        limitations.extend(
            [
                "No validated vulnerability indicator is available, so the equity component is zero and equity weighting has no effect.",
                "The demo dataset and travel-time model are model estimates; results are illustrative only.",
            ]
        )
    return {
        "service": service,
        "threshold_minutes": threshold_minutes,
        "intervention_type": intervention_type,
        "equity_weight": equity_weight,
        "strategy": strategy,
        "candidate_source": f"{len(areas)} population-area centroids",
        "weights": {
            "coverage": round(1.0 - equity_weight, 3),
            "equity": equity_weight,
            "equity_block_equity_share": EQUITY_BLOCK_EQUITY_WEIGHT,
            "equity_block_travel_share": EQUITY_BLOCK_TRAVEL_WEIGHT,
            "concentration_penalty": CONCENTRATION_PENALTY,
        },
        "baseline": baseline.summary.to_dict(),
        "routing": _routing_dict(baseline),
        "candidates": [
            {
                "rank": index,
                "area_id": item.metrics.area.id,
                "area_name": item.metrics.area.name,
                "quadrant": item.metrics.area.quadrant,
                "lon": item.metrics.area.centroid_lon,
                "lat": item.metrics.area.centroid_lat,
                "score": round(item.score, 4),
                "score_breakdown": {
                    "coverage_component": round(item.coverage_component, 4),
                    "equity_component": round(item.equity_component, 4),
                    "travel_component": round(item.travel_component, 4),
                    "concentration_penalty": item.concentration_penalty,
                },
                "metrics": {
                    "newly_covered_population": item.metrics.newly_covered_population,
                    "newly_covered_areas": item.metrics.newly_covered_areas,
                    "vulnerability_weighted_gain": round(
                        item.metrics.vulnerability_weighted_gain, 1
                    ),
                    "person_minutes_saved": round(item.metrics.person_minutes_saved, 1),
                    "mean_travel_time_change_minutes": _round_optional(
                        item.metrics.mean_travel_time_change
                    ),
                    "remaining_uncovered_population": (
                        item.metrics.result.summary.total_population
                        - item.metrics.result.summary.covered_population
                    ),
                    "coverage_after_percent": round(
                        item.metrics.result.summary.coverage_percent, 2
                    ),
                },
                "coverage_rank": item.coverage_rank,
                "already_covered_area": item.metrics.already_covered,
                "beneficiary_areas": item.metrics.beneficiary_areas,
                "residual_gap_areas": item.metrics.residual_areas,
                "explanation": item.explanation,
            }
            for index, item in enumerate(top, start=1)
        ],
        "recommended_set": recommended_set,
        "comparison": both_sets,
        "assumptions": list(definition["assumptions"]),
        "limitations": limitations,
        "vulnerability_available": vulnerability_available,
        "methodology": {
            "objective": (
                "Favour underserved populations, increase the number of people within "
                "the selected travel-time threshold, reduce travel times, and softly "
                "discourage placement in already-served areas."
            ),
            "score_formula": (
                "score = (1-equity_weight)*coverage_component + equity_weight*"
                "(0.75*equity_component + 0.25*travel_component); multiplied by "
                "0.9 when the candidate's own area is already within the threshold."
            ),
            "greedy": (
                "Facilities are selected one at a time. After each selection the "
                "accessibility analysis is re-run so later picks reflect the marginal "
                "effect of earlier picks. Ties break deterministically by area ID."
            ),
        },
    }


def make_candidate_facility(
    area: AnalysisArea, intervention_type: str, intervention_label: str
) -> AnalysisFacility:
    definition = INTERVENTION_BY_ID[intervention_type]
    return AnalysisFacility(
        id=f"candidate-{area.id}",
        name=f"Proposed {intervention_label} near {area.name}",
        facility_type=intervention_type,
        services=tuple(definition["services"]),
        lon=area.centroid_lon,
        lat=area.centroid_lat,
        data_status="proposed",
    )


def evaluate_candidate(
    area: AnalysisArea,
    areas: list[AnalysisArea],
    baseline_facilities: list[AnalysisFacility],
    baseline: AccessibilityResult,
    service: str,
    threshold_minutes: int,
    router: TravelTimeRouter,
    intervention_type: str,
    intervention_label: str,
) -> CandidateMetrics:
    candidate = make_candidate_facility(area, intervention_type, intervention_label)
    result = analyze(
        areas,
        [*baseline_facilities, candidate],
        service,
        threshold_minutes,
        router,
    )
    baseline_by_id = {item.area.id: item for item in baseline.areas}
    newly_covered: list[tuple[AnalysisArea, int]] = []
    vulnerability_gain = 0.0
    person_minutes = 0.0
    for proposed_area in result.areas:
        base_area = baseline_by_id[proposed_area.area.id]
        if proposed_area.covered and not base_area.covered:
            newly_covered.append(
                (proposed_area.area, proposed_area.area.population or 0)
            )
            vulnerability_gain += (proposed_area.area.population or 0) * (
                proposed_area.area.vulnerability_index or 0.0
            )
        if (
            proposed_area.travel_time_minutes is not None
            and base_area.travel_time_minutes is not None
        ):
            improvement = (
                base_area.travel_time_minutes - proposed_area.travel_time_minutes
            )
            if improvement > 0:
                person_minutes += improvement * proposed_area.area.population

    newly_sorted = sorted(
        newly_covered,
        key=lambda pair: (
            -pair[1],
            -(pair[0].vulnerability_index or 0.0),
            pair[0].id,
        ),
    )
    beneficiaries = [
        {
            "area_id": item.id,
            "name": item.name,
            "population": population,
            "vulnerability_index": item.vulnerability_index,
        }
        for item, population in newly_sorted[:3]
    ]
    residual = sorted(
        (
            item
            for item in result.areas
            if not item.covered and item.area.has_population
        ),
        key=lambda item: (-(item.area.population or 0), item.area.id),
    )
    residual_areas = [
        {
            "area_id": item.area.id,
            "name": item.area.name,
            "population": item.area.population,
            "travel_time_minutes": _round_optional(item.travel_time_minutes),
            "vulnerability_index": item.area.vulnerability_index,
        }
        for item in residual[:3]
    ]
    mean_change = None
    if (
        baseline.summary.weighted_mean_travel_time is not None
        and result.summary.weighted_mean_travel_time is not None
    ):
        mean_change = (
            result.summary.weighted_mean_travel_time
            - baseline.summary.weighted_mean_travel_time
        )
    base_area_itself = baseline_by_id[area.id]
    return CandidateMetrics(
        area=area,
        result=result,
        newly_covered_population=sum(population for _, population in newly_covered),
        newly_covered_areas=len(newly_covered),
        vulnerability_weighted_gain=vulnerability_gain,
        person_minutes_saved=person_minutes,
        mean_travel_time_change=mean_change,
        already_covered=base_area_itself.covered,
        beneficiary_areas=beneficiaries,
        residual_areas=residual_areas,
    )


def _greedy_set(
    areas: list[AnalysisArea],
    facilities: list[AnalysisFacility],
    service: str,
    threshold_minutes: int,
    router: TravelTimeRouter,
    intervention_type: str,
    intervention_label: str,
    set_size: int,
    equity_weight: float,
    strategy: Strategy,
) -> dict[str, Any]:
    baseline = analyze(areas, facilities, service, threshold_minutes, router)
    current = baseline
    selected: list[AnalysisFacility] = []
    used_area_ids: set[str] = set()
    steps: list[dict[str, Any]] = []

    for step in range(1, set_size + 1):
        round_metrics: list[tuple[AnalysisArea, CandidateMetrics, int, float]] = []
        for area in areas:
            if area.id in used_area_ids:
                continue
            metrics = evaluate_candidate(
                area=area,
                areas=areas,
                baseline_facilities=[*facilities, *selected],
                baseline=current,
                service=service,
                threshold_minutes=threshold_minutes,
                router=router,
                intervention_type=intervention_type,
                intervention_label=intervention_label,
            )
            marginal = (
                metrics.result.summary.covered_population
                - current.summary.covered_population
            )
            round_metrics.append((area, metrics, marginal, metrics.vulnerability_weighted_gain))

        if not round_metrics:
            break

        if strategy == "max_coverage":
            chosen_area, chosen, marginal, _ = min(
                round_metrics,
                key=lambda row: (-row[2], -row[3], row[0].id),
            )
            if marginal <= 0 and not steps:
                break
            step_score = 1.0
        else:
            max_marginal = max(row[2] for row in round_metrics)
            max_equity = max(row[3] for row in round_metrics)
            max_travel = max(row[1].person_minutes_saved for row in round_metrics)
            scored_round = []
            for area, metrics, marginal, equity_gain in round_metrics:
                coverage_component = _norm(marginal, max_marginal)
                equity_component = _norm(equity_gain, max_equity)
                travel_component = _norm(metrics.person_minutes_saved, max_travel)
                penalty = (
                    CONCENTRATION_PENALTY if metrics.already_covered else 0.0
                )
                score = _composite(
                    coverage_component,
                    equity_component,
                    travel_component,
                    penalty,
                    equity_weight,
                )
                scored_round.append((area, metrics, marginal, score))
            chosen_area, chosen, marginal, step_score = min(
                scored_round,
                key=lambda row: (-row[3], -row[2], row[0].id),
            )
            if step_score <= 0 and marginal <= 0:
                break

        cumulative_new = (
            chosen.result.summary.covered_population
            - baseline.summary.covered_population
        )
        used_area_ids.add(chosen_area.id)
        selected.append(
            make_candidate_facility(
                chosen_area, intervention_type, intervention_label
            )
        )
        steps.append(
            {
                "step": step,
                "area_id": chosen_area.id,
                "area_name": chosen_area.name,
                "quadrant": chosen_area.quadrant,
                "lon": chosen_area.centroid_lon,
                "lat": chosen_area.centroid_lat,
                "score": round(step_score, 4),
                "marginal_newly_covered_population": marginal,
                "marginal_newly_covered_areas": chosen.newly_covered_areas,
                "cumulative_newly_covered_population": cumulative_new,
                "cumulative_coverage_percent": round(
                    chosen.result.summary.coverage_percent, 2
                ),
                "explanation": (
                    f"Step {step}: a {intervention_label.lower()} near "
                    f"{chosen_area.name} adds {marginal:,} newly covered people within "
                    f"{threshold_minutes} minutes, lifting modelled coverage to "
                    f"{chosen.result.summary.coverage_percent:.1f}%."
                ),
            }
        )
        current = chosen.result

    residual = sorted(
        (
            item
            for item in current.areas
            if not item.covered and item.area.has_population
        ),
        key=lambda item: (-(item.area.population or 0), item.area.id),
    )
    residual_gaps = [
        {
            "area_id": item.area.id,
            "name": item.area.name,
            "population": item.area.population,
            "travel_time_minutes": _round_optional(item.travel_time_minutes),
            "vulnerability_index": item.area.vulnerability_index,
        }
        for item in residual[:10]
    ]
    total_newly_covered = (
        current.summary.covered_population - baseline.summary.covered_population
    )
    return {
        "strategy": strategy,
        "equity_weight": equity_weight,
        "facilities": steps,
        "total_newly_covered_population": total_newly_covered,
        "baseline_coverage_percent": round(
            baseline.summary.coverage_percent, 2
        ),
        "final_coverage_percent": round(current.summary.coverage_percent, 2),
        "coverage_gain_percentage_points": round(
            current.summary.coverage_percent - baseline.summary.coverage_percent, 2
        ),
        "final_weighted_mean_travel_time": _round_optional(
            current.summary.weighted_mean_travel_time
        ),
        "weighted_mean_travel_time_change": _round_optional(
            current.summary.weighted_mean_travel_time
            - baseline.summary.weighted_mean_travel_time
            if current.summary.weighted_mean_travel_time is not None
            and baseline.summary.weighted_mean_travel_time is not None
            else None
        ),
        "remaining_uncovered_population": (
            current.summary.total_population - current.summary.covered_population
        ),
        "remaining_wards_over_threshold": current.summary.wards_over_threshold,
        "residual_gaps": residual_gaps,
        "summary": current.summary.to_dict(),
    }


def _candidate_explanation(
    candidate: RankedCandidate,
    threshold_minutes: int,
    baseline: AccessibilityResult,
    intervention_label: str,
) -> str:
    metrics = candidate.metrics
    parts = [
        f"A {intervention_label.lower()} at the centroid of {metrics.area.name} would newly "
        f"cover {metrics.newly_covered_population:,} people within {threshold_minutes} "
        f"minutes across {metrics.newly_covered_areas} area(s)."
    ]
    if metrics.beneficiary_areas:
        names = ", ".join(item["name"] for item in metrics.beneficiary_areas)
        parts.append(f"Largest beneficiary areas: {names}.")
    if metrics.mean_travel_time_change is not None:
        direction = "reduction" if metrics.mean_travel_time_change <= 0 else "increase"
        parts.append(
            f"Population-weighted mean travel time {direction}: "
            f"{abs(metrics.mean_travel_time_change):.1f} minutes."
        )
    if metrics.already_covered:
        parts.append(
            "The candidate's own area is already within the threshold, so a 10% "
            "concentration penalty applies."
        )
    parts.append(
        f"After this single facility, {metrics.result.summary.wards_over_threshold} "
        "areas remain outside the threshold."
    )
    return " ".join(parts)


def _norm(value: float, maximum: float | int) -> float:
    if maximum <= 0:
        return 0.0
    return max(0.0, min(1.0, float(value) / float(maximum)))


def _composite(
    coverage_component: float,
    equity_component: float,
    travel_component: float,
    penalty: float,
    equity_weight: float,
) -> float:
    equity_block = (
        EQUITY_BLOCK_EQUITY_WEIGHT * equity_component
        + EQUITY_BLOCK_TRAVEL_WEIGHT * travel_component
    )
    raw = (1.0 - equity_weight) * coverage_component + equity_weight * equity_block
    return raw * (1.0 - penalty)


def _round_optional(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


def _routing_dict(result: AccessibilityResult) -> dict[str, Any]:
    info = result.routing
    return {
        "id": info.id,
        "label": info.label,
        "description": info.description,
        "is_estimate": info.is_estimate,
        "live_traffic": info.live_traffic,
        "warnings": list(info.warnings),
    }
