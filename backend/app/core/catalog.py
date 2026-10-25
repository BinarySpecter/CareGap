"""Canonical service, facility, and intervention definitions.

These definitions are shared by the API, analysis engine, documentation, and
the demo-data generator. Keep them consistent with the generator and docs.
"""

from __future__ import annotations

from typing import Literal, TypedDict

SERVICE_IDS = ("primary_care", "maternal_health", "diagnostics", "emergency")
DEFAULT_SERVICE = "maternal_health"
DEFAULT_THRESHOLD_MINUTES = 15
ALLOWED_THRESHOLDS = (15, 30, 45, 60, 90)
MIN_THRESHOLD_MINUTES = 5
MAX_THRESHOLD_MINUTES = 180


class ServiceDefinition(TypedDict):
    id: str
    label: str
    description: str
    default_threshold_minutes: int
    thresholds: list[int]


SERVICES: list[ServiceDefinition] = [
    {
        "id": "primary_care",
        "label": "Primary care",
        "description": (
            "General outpatient and first-contact care. Suitable facilities include "
            "hospitals, primary health centres, community health centres, and proposed "
            "primary-care or mobile clinics."
        ),
        "default_threshold_minutes": 30,
        "thresholds": [15, 30, 45, 60, 90],
    },
    {
        "id": "maternal_health",
        "label": "Maternal health",
        "description": (
            "Antenatal, delivery, and postnatal services. The model only checks whether "
            "a facility is mapped as offering maternal health, not whether a service "
            "slot or specialist is available."
        ),
        "default_threshold_minutes": 15,
        "thresholds": [15, 30, 45, 60, 90],
    },
    {
        "id": "diagnostics",
        "label": "Diagnostics",
        "description": (
            "Basic diagnostic and laboratory services. A mapped diagnostic offering does "
            "not guarantee test availability, equipment uptime, or affordable pricing."
        ),
        "default_threshold_minutes": 45,
        "thresholds": [15, 30, 45, 60, 90],
    },
    {
        "id": "emergency",
        "label": "Emergency care",
        "description": (
            "Emergency-capable hospital care. In the Delhi pilot, emergency "
            "suitability is attributed only where OpenStreetMap carries an "
            "emergency=yes tag; it is not verified."
        ),
        "default_threshold_minutes": 60,
        "thresholds": [15, 30, 45, 60, 90],
    },
]

SERVICE_BY_ID = {service["id"]: service for service in SERVICES}

DEFAULT_LENS_NOTE = (
    "Default lens: maternal health within 15 minutes. This is a configurable "
    "planning assumption chosen to surface variation in the mapped inventory, "
    "not a clinical standard. Primary-care coverage is near-saturated in this "
    "release because OpenStreetMap maps a dense clinic and hospital inventory; "
    "switch service or threshold to inspect emergency, diagnostic, or maternal "
    "access gaps."
)

FACILITY_TYPES: dict[str, dict[str, object]] = {
    # Real-data categories used by the Delhi pilot. Services are only defaults
    # for imports; the released facilities carry tag-derived service lists.
    "hospital": {
        "label": "Hospital",
        "services": ["primary_care"],
    },
    "health_centre": {
        "label": "Health centre / Ayushman Arogya Mandir",
        "services": ["primary_care"],
    },
    "dispensary": {
        "label": "Dispensary",
        "services": ["primary_care"],
    },
    "clinic": {
        "label": "Clinic / doctor",
        "services": ["primary_care"],
    },
    "birthing_centre": {
        "label": "Birthing centre",
        "services": ["maternal_health"],
    },
    "diagnostic_laboratory": {
        "label": "Diagnostic laboratory",
        "services": ["diagnostics"],
    },
    # Synthetic demonstration categories. Retained so the demo dataset and its
    # tests remain stable and clearly separate from real-data categories.
    "district_hospital": {
        "label": "District hospital (demo)",
        "services": ["primary_care", "maternal_health", "diagnostics", "emergency"],
    },
    "primary_health_centre": {
        "label": "Primary health centre (demo)",
        "services": ["primary_care", "maternal_health", "diagnostics"],
    },
    "community_health_centre": {
        "label": "Community health centre (demo)",
        "services": ["primary_care", "maternal_health"],
    },
    "diagnostic_centre": {
        "label": "Diagnostic centre (demo)",
        "services": ["diagnostics"],
    },
    "maternal_health_centre": {
        "label": "Maternal health centre (demo)",
        "services": ["maternal_health"],
    },
}

FACILITY_TYPE_LABELS = {key: str(value["label"]) for key, value in FACILITY_TYPES.items()}
FACILITY_TYPE_SERVICES: dict[str, list[str]] = {
    key: list(value["services"]) for key, value in FACILITY_TYPES.items()  # type: ignore[arg-type]
}


class InterventionDefinition(TypedDict):
    id: str
    label: str
    description: str
    services: list[str]
    default_service: str
    operation: Literal["full_time", "scheduled", "temporary"]
    assumptions: list[str]


INTERVENTIONS: list[InterventionDefinition] = [
    {
        "id": "primary_care_clinic",
        "label": "Primary care clinic",
        "description": "A new fixed primary-care facility with maternal health support.",
        "services": ["primary_care", "maternal_health"],
        "default_service": "primary_care",
        "operation": "full_time",
        "assumptions": [
            "Assumes full-time operation with an adequate clinical workforce.",
            "Assumes the facility is staffed and supplied continuously; capacity is not modelled.",
            "Travel time to the facility is used as a proxy for access; quality of care is not modelled.",
        ],
    },
    {
        "id": "mobile_clinic",
        "label": "Mobile health unit",
        "description": "A recurring mobile primary-care visit point.",
        "services": ["primary_care"],
        "default_service": "primary_care",
        "operation": "scheduled",
        "assumptions": [
            "Assumes a recurring weekly visit at the proposed location.",
            "Travel time is modelled as if the service is available at that point; visit frequency, wait time, and capacity are not modelled.",
            "Only primary care is modelled for mobile units.",
        ],
    },
    {
        "id": "diagnostic_centre",
        "label": "Diagnostic centre",
        "description": "A new fixed diagnostic and laboratory facility.",
        "services": ["diagnostics"],
        "default_service": "diagnostics",
        "operation": "full_time",
        "assumptions": [
            "Assumes functioning diagnostic equipment and staff.",
            "Test menu, equipment uptime, and affordability are not modelled.",
        ],
    },
    {
        "id": "medical_camp",
        "label": "Medical camp",
        "description": "A recurring community health camp offering primary and maternal care.",
        "services": ["primary_care", "maternal_health"],
        "default_service": "primary_care",
        "operation": "temporary",
        "assumptions": [
            "Assumes a recurring camp rather than a one-off event.",
            "Travel time treats the camp as available at the proposed location; frequency, staffing, and duration are not modelled.",
            "Maternal services only count if the camp is assumed to offer them.",
        ],
    },
    {
        "id": "sub_centre",
        "label": "Sub-centre",
        "description": "A new sub-centre delivering first-contact primary and maternal care.",
        "services": ["primary_care", "maternal_health"],
        "default_service": "primary_care",
        "operation": "full_time",
        "assumptions": [
            "Assumes the sub-centre is staffed and stocked as an operational facility.",
            "Assumes maternal health is offered; a sub-centre without a skilled birth attendant would not deliver delivery care.",
            "Capacity, staffing, and referral linkages are not modelled.",
        ],
    },
    {
        "id": "health_wellness_centre",
        "label": "Ayushman Arogya Mandir / Health & Wellness Centre",
        "description": "A comprehensive primary-care centre with maternal and basic diagnostic services.",
        "services": ["primary_care", "maternal_health", "diagnostics"],
        "default_service": "primary_care",
        "operation": "full_time",
        "assumptions": [
            "Assumes services consistent with the Ayushman Arogya Mandir comprehensive primary-care package.",
            "Assumes diagnostic equipment is functional and staffed.",
            "Actual service packages, staffing, and opening hours are not verified or modelled.",
        ],
    },
]

INTERVENTION_BY_ID = {item["id"]: item for item in INTERVENTIONS}
INTERVENTION_IDS = tuple(INTERVENTION_BY_ID)


def services_for_facility_type(facility_type: str) -> list[str]:
    return FACILITY_TYPE_SERVICES.get(facility_type, [])


def services_for_intervention(intervention_type: str) -> list[str]:
    definition = INTERVENTION_BY_ID.get(intervention_type)
    return list(definition["services"]) if definition else []


def is_valid_service(service: str) -> bool:
    return service in SERVICE_BY_ID


def is_valid_threshold(threshold_minutes: int) -> bool:
    return MIN_THRESHOLD_MINUTES <= threshold_minutes <= MAX_THRESHOLD_MINUTES


def public_catalog() -> dict[str, object]:
    return {
        "services": SERVICES,
        "interventions": INTERVENTIONS,
        "facility_types": [
            {
                "id": key,
                "label": value["label"],
                "services": value["services"],
            }
            for key, value in FACILITY_TYPES.items()
        ],
        "allowed_thresholds": list(ALLOWED_THRESHOLDS),
        "default_service": DEFAULT_SERVICE,
        "default_threshold_minutes": DEFAULT_THRESHOLD_MINUTES,
    }
