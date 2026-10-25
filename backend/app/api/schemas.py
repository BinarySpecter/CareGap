from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.catalog import (
    DEFAULT_SERVICE,
    DEFAULT_THRESHOLD_MINUTES,
    INTERVENTION_BY_ID,
    MAX_THRESHOLD_MINUTES,
    MIN_THRESHOLD_MINUTES,
    is_valid_service,
    services_for_intervention,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ServiceOut(BaseModel):
    id: str
    label: str
    description: str
    default_threshold_minutes: int
    thresholds: list[int]


class InterventionOut(BaseModel):
    id: str
    label: str
    description: str
    services: list[str]
    default_service: str
    operation: Literal["full_time", "scheduled", "temporary"]
    assumptions: list[str]


class FacilityTypeOut(BaseModel):
    id: str
    label: str
    services: list[str]


class DatasetInfoOut(BaseModel):
    id: str
    name: str
    short_name: str
    description: str
    is_synthetic: bool
    data_status: str
    seed: int | None = None
    generated_at: str | None = None
    geography: dict[str, Any]
    counts: dict[str, int]
    sources: list[dict[str, Any]]
    limitations: list[str]
    road_model: dict[str, Any]


class RoutingInfoOut(BaseModel):
    id: str
    label: str
    description: str
    is_estimate: bool
    live_traffic: bool
    warnings: list[str]


class DistributionBucketOut(BaseModel):
    bucket: str
    areas: int
    population: int


class AccessSummaryOut(BaseModel):
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
    distribution: list[DistributionBucketOut]


class FacilityOut(BaseModel):
    id: str
    name: str
    facility_type: str
    facility_type_label: str
    services: list[str]
    lon: float
    lat: float
    data_status: str


class AreaAccessOut(BaseModel):
    area_id: str
    name: str
    population: int
    vulnerability_index: float
    area_km2: float
    centroid: list[float]
    quadrant: str
    travel_time_minutes: float | None
    nearest_facility_id: str | None
    nearest_facility_name: str | None
    suitable_facilities_within_threshold: int
    covered: bool


class GeoJsonCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]
    name: str | None = None


class OverviewResponse(BaseModel):
    dataset: DatasetInfoOut
    service: str
    threshold_minutes: int
    summary: AccessSummaryOut
    routing: RoutingInfoOut
    services: list[ServiceOut]
    thresholds: list[int]
    facilities: list[FacilityOut]
    areas: dict[str, Any]
    catchment: dict[str, Any]
    data_notice: str


class AccessibilityResponse(BaseModel):
    dataset: DatasetInfoOut
    service: str
    threshold_minutes: int
    summary: AccessSummaryOut
    areas: list[AreaAccessOut]
    routing: RoutingInfoOut
    data_notice: str


class AnalysisRequest(StrictModel):
    service: str = DEFAULT_SERVICE
    threshold_minutes: int = Field(
        DEFAULT_THRESHOLD_MINUTES, ge=MIN_THRESHOLD_MINUTES, le=MAX_THRESHOLD_MINUTES
    )

    @field_validator("service")
    @classmethod
    def validate_service(cls, value: str) -> str:
        if not is_valid_service(value):
            raise ValueError(f"Unknown service '{value}'")
        return value


class FacilityListResponse(BaseModel):
    items: list[FacilityOut]
    total: int
    limit: int
    offset: int


class AreaListResponse(BaseModel):
    areas: dict[str, Any]
    total: int
    limit: int
    offset: int


class InterventionIn(StrictModel):
    intervention_type: str
    name: str | None = Field(default=None, max_length=120)
    lon: float = Field(ge=-180.0, le=180.0)
    lat: float = Field(ge=-90.0, le=90.0)

    @field_validator("intervention_type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in INTERVENTION_BY_ID:
            raise ValueError(f"Unknown intervention type '{value}'")
        return value

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None


class ScenarioCreate(StrictModel):
    name: str = Field(default="Proposed intervention", min_length=1, max_length=160)
    service: str = DEFAULT_SERVICE
    threshold_minutes: int = Field(
        DEFAULT_THRESHOLD_MINUTES, ge=MIN_THRESHOLD_MINUTES, le=MAX_THRESHOLD_MINUTES
    )
    interventions: list[InterventionIn] = Field(min_length=1, max_length=5)

    @field_validator("service")
    @classmethod
    def validate_service(cls, value: str) -> str:
        if not is_valid_service(value):
            raise ValueError(f"Unknown service '{value}'")
        return value

    @model_validator(mode="after")
    def validate_interventions(self) -> ScenarioCreate:
        types = {item.intervention_type for item in self.interventions}
        if len(types) > 1:
            raise ValueError("All interventions in a scenario must use the same type")
        first = self.interventions[0]
        if self.service not in services_for_intervention(first.intervention_type):
            label = str(INTERVENTION_BY_ID[first.intervention_type]["label"])
            raise ValueError(f"{label} does not provide the selected service")
        return self


class ScenarioOut(BaseModel):
    id: str
    dataset_id: str
    name: str
    intervention_type: str
    service: str
    threshold_minutes: int
    interventions: list[dict[str, Any]]
    created_at: datetime


class ScenarioListResponse(BaseModel):
    items: list[ScenarioOut]
    total: int


class ImprovementOut(BaseModel):
    area_id: str
    name: str
    population: int
    vulnerability_index: float
    travel_time_baseline: float | None
    travel_time_proposed: float | None
    improvement_minutes: float | None
    newly_covered_population: int


class ResidualGapOut(BaseModel):
    area_id: str
    name: str
    population: int
    travel_time_minutes: float | None
    vulnerability_index: float


class EquityOut(BaseModel):
    worst_served_population_share: float
    worst_served_area_count: int
    worst_served_population: int
    baseline_coverage_percent: float
    proposed_coverage_percent: float
    coverage_gain_percentage_points: float
    baseline_mean_travel_time: float | None
    proposed_mean_travel_time: float | None
    mean_travel_time_improvement: float | None


class ComparisonDeltaOut(BaseModel):
    newly_covered_population: int
    coverage_gain_percentage_points: float
    weighted_mean_travel_time_change: float | None
    weighted_median_travel_time_change: float | None
    wards_newly_covered: int
    wards_improved: int
    wards_worsened: int
    remaining_uncovered_population: int
    remaining_wards_over_threshold: int


class ScenarioSimulationResponse(BaseModel):
    scenario: ScenarioOut
    service: str
    threshold_minutes: int
    baseline: AccessSummaryOut
    proposed: AccessSummaryOut
    delta: ComparisonDeltaOut
    equity: EquityOut
    routing: RoutingInfoOut
    areas: dict[str, Any]
    facilities: list[FacilityOut]
    proposed_facilities: list[FacilityOut]
    catchment_baseline: dict[str, Any]
    catchment_proposed: dict[str, Any]
    top_improvements: list[ImprovementOut]
    residual_gaps: list[ResidualGapOut]
    assumptions: list[str]
    warnings: list[str]
    data_notice: str


class BenefitAreaOut(BaseModel):
    area_id: str
    name: str
    population: int
    vulnerability_index: float


class CandidateMetricsOut(BaseModel):
    newly_covered_population: int
    newly_covered_areas: int
    vulnerability_weighted_gain: float
    person_minutes_saved: float
    mean_travel_time_change_minutes: float | None
    remaining_uncovered_population: int
    coverage_after_percent: float


class ScoreBreakdownOut(BaseModel):
    coverage_component: float
    equity_component: float
    travel_component: float
    concentration_penalty: float


class RecommendationCandidateOut(BaseModel):
    rank: int
    area_id: str
    area_name: str
    quadrant: str
    lon: float
    lat: float
    score: float
    score_breakdown: ScoreBreakdownOut
    metrics: CandidateMetricsOut
    coverage_rank: int
    already_covered_area: bool
    beneficiary_areas: list[BenefitAreaOut]
    residual_gap_areas: list[ResidualGapOut]
    explanation: str


class GreedyStepOut(BaseModel):
    step: int
    area_id: str
    area_name: str
    quadrant: str
    lon: float
    lat: float
    score: float
    marginal_newly_covered_population: int
    marginal_newly_covered_areas: int
    cumulative_newly_covered_population: int
    cumulative_coverage_percent: float
    explanation: str


class GreedySetOut(BaseModel):
    strategy: str
    equity_weight: float
    facilities: list[GreedyStepOut]
    total_newly_covered_population: int
    baseline_coverage_percent: float
    final_coverage_percent: float
    coverage_gain_percentage_points: float
    final_weighted_mean_travel_time: float | None
    weighted_mean_travel_time_change: float | None
    remaining_uncovered_population: int
    remaining_wards_over_threshold: int
    residual_gaps: list[ResidualGapOut]
    summary: AccessSummaryOut


class RecommendationWeightsOut(BaseModel):
    coverage: float
    equity: float
    equity_block_equity_share: float
    equity_block_travel_share: float
    concentration_penalty: float


class RecommendationMethodologyOut(BaseModel):
    objective: str
    score_formula: str
    greedy: str


class RecommendationResponse(BaseModel):
    service: str
    threshold_minutes: int
    intervention_type: str
    equity_weight: float
    strategy: str
    candidate_source: str
    weights: RecommendationWeightsOut
    baseline: AccessSummaryOut
    routing: RoutingInfoOut
    candidates: list[RecommendationCandidateOut]
    recommended_set: GreedySetOut
    comparison: dict[str, GreedySetOut]
    assumptions: list[str]
    limitations: list[str]
    methodology: RecommendationMethodologyOut


class ImportIssueOut(BaseModel):
    row: int | None
    field: str | None
    message: str


class ImportReportOut(BaseModel):
    import_id: str
    dataset_id: str
    kind: str
    status: str
    rows_total: int
    rows_imported: int
    duplicates_skipped: int
    errors: list[ImportIssueOut]
    errors_truncated: bool


class MetaResponse(BaseModel):
    api_version: str
    dataset: DatasetInfoOut
    services: list[ServiceOut]
    interventions: list[InterventionOut]
    facility_types: list[FacilityTypeOut]
    allowed_thresholds: list[int]
    default_service: str
    default_threshold_minutes: int
    routing: RoutingInfoOut
    data_notice: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    dataset_loaded: bool
    database: str
    environment: str


class ImportRunOut(BaseModel):
    id: str
    dataset_id: str
    filename: str
    kind: str
    status: str
    rows_total: int
    rows_imported: int
    errors: list[ImportIssueOut]
    created_at: datetime


class ImportRunListResponse(BaseModel):
    items: list[ImportRunOut]
    total: int
