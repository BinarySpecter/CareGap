import type { FeatureCollection, Geometry } from "geojson";

export type ServiceId =
  | "primary_care"
  | "maternal_health"
  | "diagnostics"
  | "emergency";

export interface ServiceDefinition {
  id: ServiceId | string;
  label: string;
  description: string;
  default_threshold_minutes: number;
  thresholds: number[];
}

export interface InterventionDefinition {
  id: string;
  label: string;
  description: string;
  services: string[];
  default_service: string;
  operation: "full_time" | "scheduled" | "temporary";
  assumptions: string[];
}

export interface FacilityTypeDefinition {
  id: string;
  label: string;
  services: string[];
}

export interface DatasetInfo {
  id: string;
  name: string;
  short_name: string;
  description: string;
  is_synthetic: boolean;
  data_status: string;
  release: string | null;
  seed: number | null;
  generated_at: string | null;
  geography: {
    region?: string;
    center?: [number, number];
    crs?: string;
    projected_crs?: string;
    area_km2?: number;
    bbox?: [number, number, number, number];
    study_boundary?: string;
    analysis_unit?: string;
    [key: string]: unknown;
  };
  counts: Record<string, number>;
  sources: DataSource[];
  limitations: string[];
  road_model: Record<string, unknown>;
  population: {
    reference_year?: number;
    source?: string;
    represented_population?: number;
    delhi_census_total?: number;
    unrepresented_population?: number;
    unrepresented_share_percent?: number;
    wards_with_population?: number;
    areas_without_population?: number;
    note?: string;
    [key: string]: unknown;
  };
  vulnerability: { available?: boolean; reason?: string; [key: string]: unknown };
  capabilities: { facility_import?: boolean; area_import?: boolean; area_import_reason?: string };
  validation_summary: Record<string, unknown>;
}

export interface DatasetProfile {
  id: string;
  label: string;
  is_synthetic: boolean;
  active: boolean;
  available: boolean;
  release: string | null;
}

export interface DataSource {
  id: string;
  name: string;
  publisher: string;
  type: string;
  url: string;
  retrieved_at: string;
  licence: string;
  coverage: string;
  limitations: string[];
}

export interface RoutingInfo {
  id: string;
  label: string;
  description: string;
  is_estimate: boolean;
  live_traffic: boolean;
  warnings: string[];
}

export interface DistributionBucket {
  bucket: string;
  areas: number;
  population: number;
}

export interface AccessSummary {
  service: string;
  threshold_minutes: number;
  total_population: number;
  covered_population: number;
  coverage_percent: number;
  weighted_mean_travel_time: number | null;
  weighted_median_travel_time: number | null;
  weighted_p90_travel_time: number | null;
  max_travel_time: number | null;
  wards_total: number;
  wards_over_threshold: number;
  unreachable_wards: number;
  suitable_facility_count: number;
  distribution: DistributionBucket[];
  areas_total: number;
  areas_with_population: number;
  areas_without_population: number;
  areas_without_population_over_threshold: number;
  population_reference_year: number | null;
}

export interface Facility {
  id: string;
  name: string;
  facility_type: string;
  facility_type_label: string;
  services: string[];
  lon: number;
  lat: number;
  data_status: string;
  source: string;
  source_id: string;
  source_url: string;
  ownership: string;
  operational_status: string;
  address: string;
  admin_area: string;
  source_tags: Record<string, string>;
}

export interface AreaAccess {
  area_id: string;
  name: string;
  population: number | null;
  population_status: string;
  population_reference_year: number | null;
  population_included: boolean;
  vulnerability_index: number | null;
  area_km2: number;
  centroid: [number, number];
  quadrant: string;
  municipality: string;
  travel_time_minutes: number | null;
  nearest_facility_id: string | null;
  nearest_facility_name: string | null;
  suitable_facilities_within_threshold: number;
  covered: boolean;
}

export interface AreaProperties {
  area_id: string;
  name: string;
  population: number | null;
  population_status?: string;
  population_reference_year?: number | null;
  population_included?: boolean;
  vulnerability_index: number | null;
  area_km2?: number;
  quadrant: string;
  municipality?: string;
  centroid?: [number, number];
  travel_time_minutes: number | null;
  nearest_facility_id?: string | null;
  nearest_facility_name?: string | null;
  suitable_facilities_within_threshold?: number;
  covered: boolean;
}

export interface ScenarioAreaProperties {
  area_id: string;
  name: string;
  population: number | null;
  population_included?: boolean;
  vulnerability_index: number | null;
  quadrant: string;
  municipality?: string;
  centroid?: [number, number];
  travel_time_baseline: number | null;
  travel_time_proposed: number | null;
  covered_baseline: boolean;
  covered_proposed: boolean;
  newly_covered_population: number;
  improvement_minutes: number | null;
  baseline_facility_id: string | null;
  proposed_facility_id: string | null;
}

export type AreaCollection = FeatureCollection<Geometry, AreaProperties> & {
  name?: string;
};

export type ScenarioAreaCollection = FeatureCollection<
  Geometry,
  ScenarioAreaProperties
> & { name?: string };

export type AnyCollection = FeatureCollection<Geometry, Record<string, unknown>> & {
  name?: string;
};

export interface OverviewResponse {
  dataset: DatasetInfo;
  service: string;
  threshold_minutes: number;
  summary: AccessSummary;
  routing: RoutingInfo;
  services: ServiceDefinition[];
  thresholds: number[];
  facilities: Facility[];
  areas: AreaCollection;
  catchment: AnyCollection;
  data_notice: string;
}

export interface AccessibilityResponse {
  dataset: DatasetInfo;
  service: string;
  threshold_minutes: number;
  summary: AccessSummary;
  areas: AreaAccess[];
  routing: RoutingInfo;
  data_notice: string;
}

export interface Scenario {
  id: string;
  dataset_id: string;
  name: string;
  intervention_type: string;
  service: string;
  threshold_minutes: number;
  interventions: Array<{
    id: string;
    intervention_type: string;
    name: string;
    lon: number;
    lat: number;
  }>;
  created_at: string;
}

export interface ComparisonDelta {
  newly_covered_population: number;
  coverage_gain_percentage_points: number;
  weighted_mean_travel_time_change: number | null;
  weighted_median_travel_time_change: number | null;
  wards_newly_covered: number;
  wards_improved: number;
  wards_worsened: number;
  remaining_uncovered_population: number;
  remaining_wards_over_threshold: number;
}

export interface EquitySummary {
  worst_served_population_share: number;
  worst_served_area_count: number;
  worst_served_population: number;
  baseline_coverage_percent: number;
  proposed_coverage_percent: number;
  coverage_gain_percentage_points: number;
  baseline_mean_travel_time: number | null;
  proposed_mean_travel_time: number | null;
  mean_travel_time_improvement: number | null;
}

export interface Improvement {
  area_id: string;
  name: string;
  population: number;
  vulnerability_index: number | null;
  travel_time_baseline: number | null;
  travel_time_proposed: number | null;
  improvement_minutes: number | null;
  newly_covered_population: number;
}

export interface ResidualGap {
  area_id: string;
  name: string;
  population: number;
  travel_time_minutes: number | null;
  vulnerability_index: number | null;
}

export interface SimulationResponse {
  dataset: DatasetInfo;
  scenario: Scenario;
  service: string;
  threshold_minutes: number;
  baseline: AccessSummary;
  proposed: AccessSummary;
  delta: ComparisonDelta;
  equity: EquitySummary;
  routing: RoutingInfo;
  areas: ScenarioAreaCollection;
  facilities: Facility[];
  proposed_facilities: Facility[];
  catchment_baseline: AnyCollection;
  catchment_proposed: AnyCollection;
  top_improvements: Improvement[];
  residual_gaps: ResidualGap[];
  assumptions: string[];
  warnings: string[];
  data_notice: string;
}

export interface CandidateMetrics {
  newly_covered_population: number;
  newly_covered_areas: number;
  vulnerability_weighted_gain: number;
  person_minutes_saved: number;
  mean_travel_time_change_minutes: number | null;
  remaining_uncovered_population: number;
  coverage_after_percent: number;
}

export interface RecommendationCandidate {
  rank: number;
  area_id: string;
  area_name: string;
  quadrant: string;
  lon: number;
  lat: number;
  score: number;
  score_breakdown: {
    coverage_component: number;
    equity_component: number;
    travel_component: number;
    concentration_penalty: number;
  };
  metrics: CandidateMetrics;
  coverage_rank: number;
  already_covered_area: boolean;
  beneficiary_areas: Array<{
    area_id: string;
    name: string;
    population: number;
    vulnerability_index: number | null;
  }>;
  residual_gap_areas: ResidualGap[];
  explanation: string;
}

export interface GreedyStep {
  step: number;
  area_id: string;
  area_name: string;
  quadrant: string;
  lon: number;
  lat: number;
  score: number;
  marginal_newly_covered_population: number;
  marginal_newly_covered_areas: number;
  cumulative_newly_covered_population: number;
  cumulative_coverage_percent: number;
  explanation: string;
}

export interface GreedySet {
  strategy: string;
  equity_weight: number;
  facilities: GreedyStep[];
  total_newly_covered_population: number;
  baseline_coverage_percent: number;
  final_coverage_percent: number;
  coverage_gain_percentage_points: number;
  final_weighted_mean_travel_time: number | null;
  weighted_mean_travel_time_change: number | null;
  remaining_uncovered_population: number;
  remaining_wards_over_threshold: number;
  residual_gaps: ResidualGap[];
  summary: AccessSummary;
}

export interface RecommendationsResponse {
  dataset_id: string;
  release: string | null;
  vulnerability_available: boolean;
  data_notice: string;
  service: string;
  threshold_minutes: number;
  intervention_type: string;
  equity_weight: number;
  strategy: string;
  candidate_source: string;
  weights: {
    coverage: number;
    equity: number;
    equity_block_equity_share: number;
    equity_block_travel_share: number;
    concentration_penalty: number;
  };
  baseline: AccessSummary;
  routing: RoutingInfo;
  candidates: RecommendationCandidate[];
  recommended_set: GreedySet;
  comparison: Record<string, GreedySet>;
  assumptions: string[];
  limitations: string[];
  methodology: {
    objective: string;
    score_formula: string;
    greedy: string;
  };
}

export interface MetaResponse {
  api_version: string;
  dataset: DatasetInfo;
  datasets: DatasetProfile[];
  services: ServiceDefinition[];
  interventions: InterventionDefinition[];
  facility_types: FacilityTypeDefinition[];
  allowed_thresholds: number[];
  default_service: string;
  default_threshold_minutes: number;
  default_lens_note: string;
  routing: RoutingInfo;
  data_notice: string;
  read_only: boolean;
}

export interface ImportIssue {
  row: number | null;
  field: string | null;
  message: string;
}

export interface ImportReport {
  import_id: string;
  dataset_id: string;
  kind: string;
  status: "completed" | "completed_with_errors" | "failed";
  rows_total: number;
  rows_imported: number;
  duplicates_skipped: number;
  errors: ImportIssue[];
  errors_truncated: boolean;
}

export interface ImportRun {
  id: string;
  dataset_id: string;
  filename: string;
  kind: string;
  status: string;
  rows_total: number;
  rows_imported: number;
  errors: ImportIssue[];
  created_at: string;
}

export interface ImportHistory {
  items: ImportRun[];
  total: number;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  dataset_loaded: boolean;
  database: string;
  environment: string;
  dataset_id: string | null;
  release: string | null;
  routing_model: string | null;
  read_only: boolean;
}

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  label: string;
  sublabel?: string;
  status?: string;
  rank?: number;
}

export interface ScenarioListResponse {
  items: Scenario[];
  total: number;
}
