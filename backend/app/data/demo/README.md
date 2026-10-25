# Synthetic demo data

**This dataset is entirely synthetic.** It is generated deterministically by
`backend/scripts/generate_demo_data.py` with seed `20261024`. It does not
represent a real district, real population, real health facilities, or a real
road network. Coordinates are located near Pune, Maharashtra so the demo loads
in a familiar map context, but the administrative boundary is invented.

Files:

| File | Contents |
| --- | --- |
| `dataset.json` | Metadata, source register, road model parameters, limitations |
| `areas.geojson` | 96 synthetic population areas (wards) with synthetic population and vulnerability index |
| `facilities.geojson` | 6 fictional healthcare facilities and their modelled services |
| `roads.geojson` | Synthetic 2.0 km road grid used for travel-time estimates |
| `road_nodes.geojson` | Synthetic road-network intersections |

To regenerate:

```bash
python backend/scripts/generate_demo_data.py
```

Regeneration overwrites these files but is deterministic apart from the
`generated_at` timestamp. Do not replace this dataset with real data without
updating the source register and UI provenance labels.
