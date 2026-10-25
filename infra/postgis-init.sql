-- Enable PostGIS for deployments that later adopt native spatial columns.
-- CareGap v0.1 performs spatial analysis in Python (Shapely/pyproj) and stores
-- GeoJSON in JSON columns, so the extension is not required by the app today.
CREATE EXTENSION IF NOT EXISTS postgis;
