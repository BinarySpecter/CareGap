"use client";

import {
  ArrowDownToLine,
  Check,
  Database,
  FileUp,
  Info,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { ErrorPanel } from "@/components/app/Feedback";
import { PageHeader } from "@/components/app/PageHeader";
import { apiUrl, importData } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  titleCase,
} from "@/lib/format";
import type {
  ImportHistory,
  ImportReport,
  MetaResponse,
} from "@/lib/types";
import { useApiData } from "@/lib/use-api";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "border-[var(--signal)]/25 bg-[var(--signal-soft)] text-[var(--signal-deep)]",
    completed_with_errors: "border-[var(--gap)]/25 bg-[var(--gap-soft)] text-[#7d4b0e]",
    failed: "border-[var(--critical)]/25 bg-[var(--critical-soft)] text-[var(--critical)]",
    synthetic: "border-[var(--gap)]/25 bg-[var(--gap-soft)]/60 text-[#7d4b0e]",
  };
  return (
    <span
      className={`mono inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[7.5px] uppercase tracking-[0.07em] ${styles[status] ?? "border-[var(--rule)] bg-[var(--paper-2)] text-[var(--ink-2)]"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

const CSV_TEMPLATE =
  "name,facility_type,lon,lat,services\n" +
  "New Primary Health Centre,primary_health_centre,73.860,18.520,primary_care;diagnostics\n";

export function DataSourcesClient() {
  const meta = useApiData<MetaResponse>(apiUrl("/api/v1/meta"));
  const history = useApiData<ImportHistory>(apiUrl("/api/v1/data/imports", { limit: 15 }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<"facilities" | "areas">("facilities");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submitImport() {
    if (!file) {
      setUploadError("Choose a CSV or GeoJSON file first.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setReport(null);
    try {
      const result = await importData(file, uploadKind);
      setReport(result);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      history.reload();
      meta.reload();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "The import could not be completed.",
      );
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "caregap-facilities-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadProvenance() {
    if (!meta.data) return;
    const blob = new Blob([JSON.stringify(meta.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "caregap-dataset-provenance.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-gutter">
      <div className="content-max pb-10 pt-6">
        <PageHeader
          index="06"
          eyebrow="Data management"
          title="What this model knows, and where it came from."
          description="A source register, provenance record, and validated import path. Synthetic demonstration data is labelled as synthetic; imports are checked for coordinates, schema, duplicates, and boundary containment before they reach the analysis database."
          actions={
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={downloadProvenance}
                disabled={!meta.data}
              >
                <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                Export provenance JSON
              </button>
              <Link href="/app/methodology#data" className="btn btn-outline btn-sm">
                Validation method
              </Link>
            </>
          }
        />

        {meta.error && !meta.data ? (
          <div className="mt-6">
            <ErrorPanel message={meta.error} onRetry={meta.reload} />
          </div>
        ) : !meta.data ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="skeleton h-[300px]" />
            <div className="skeleton h-[300px]" />
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-col justify-between gap-3 border-y border-[var(--rule)] py-3 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2.5">
                <span className="status-dot status-dot--gap mt-[6px] h-[5px] w-[5px]" aria-hidden="true" />
                <p className="max-w-[90ch] text-[10.5px] leading-relaxed text-[var(--ink-3)]">
                  {meta.data.data_notice}
                </p>
              </div>
              <span className="mono shrink-0 text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                API v{meta.data.api_version} · {meta.data.routing.label}
              </span>
            </div>

            <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="border border-[var(--rule)] bg-[var(--sheet)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Source register
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                      Sources currently backing this workspace
                    </p>
                  </div>
                  <Database className="h-4 w-4 text-[var(--ink-3)]" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Dataset sources and provenance
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        <th scope="col">Type</th>
                        <th scope="col">Publisher</th>
                        <th scope="col">Retrieved</th>
                        <th scope="col">Licence</th>
                        <th scope="col">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meta.data.dataset.sources.map((source) => (
                        <tr key={source.id}>
                          <td>
                            <p className="font-medium">{source.name}</p>
                            <p className="mono mt-0.5 text-[8px] text-[var(--ink-3)]">
                              {source.url}
                            </p>
                          </td>
                          <td>
                            <StatusBadge status={source.type} />
                          </td>
                          <td className="text-[11px] text-[var(--ink-2)]">
                            {source.publisher}
                          </td>
                          <td className="whitespace-nowrap text-[10px] text-[var(--ink-2)]">
                            {source.retrieved_at}
                          </td>
                          <td className="max-w-[160px] text-[10px] text-[var(--ink-2)]">
                            {source.licence}
                          </td>
                          <td className="max-w-[220px] text-[10px] text-[var(--ink-2)]">
                            {source.coverage}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-[var(--rule)] px-4 py-3">
                  <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Source limitations
                  </p>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {meta.data.dataset.sources.flatMap((source) =>
                      source.limitations.map((limitation) => (
                        <li
                          key={`${source.id}-${limitation}`}
                          className="flex gap-1.5 text-[9.5px] leading-relaxed text-[var(--ink-2)]"
                        >
                          <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[var(--gap)]" aria-hidden="true" />
                          {limitation}
                        </li>
                      )),
                    )}
                  </ul>
                </div>
              </div>

              <aside className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Dataset profile
                </p>
                <h2 className="serif mt-2 text-[24px] leading-tight text-[var(--ink)]">
                  {meta.data.dataset.short_name}
                </h2>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
                  {meta.data.dataset.description}
                </p>
                <dl className="mt-4 space-y-0">
                  {[
                    ["Dataset ID", meta.data.dataset.id],
                    ["Status", meta.data.dataset.data_status],
                    ["Region", meta.data.dataset.geography.region ?? "—"],
                    ["Area", `${formatNumber(meta.data.dataset.geography.area_km2 ?? 0)} km²`],
                    ["Population", formatNumber(meta.data.dataset.counts.population ?? 0)],
                    ["Areas", String(meta.data.dataset.counts.areas ?? "—")],
                    ["Facilities", String(meta.data.dataset.counts.facilities ?? "—")],
                    ["Seed", String(meta.data.dataset.seed ?? "—")],
                    ["Generated", formatDate(meta.data.dataset.generated_at)],
                    ["Projection", meta.data.dataset.geography.projected_crs ?? "—"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-1.5"
                    >
                      <dt className="mono text-[7.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                        {label}
                      </dt>
                      <dd className="mono text-right text-[9px] text-[var(--ink-2)]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 border-t border-[var(--rule)] pt-3">
                  <p className="mono text-[8px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Routing model
                  </p>
                  <p className="mt-1 text-[10.5px] font-medium text-[var(--ink)]">
                    {meta.data.routing.label}
                  </p>
                  <p className="mt-1 text-[9.5px] leading-relaxed text-[var(--ink-3)]">
                    {meta.data.routing.description}
                  </p>
                </div>
              </aside>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="border border-[var(--rule)] bg-[var(--sheet)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Facility &amp; service catalogue
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                      Mapped service suitability drives the nearest-facility calculation
                    </p>
                  </div>
                  <Info className="h-4 w-4 text-[var(--ink-3)]" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="mt-3 overflow-hidden border border-[var(--rule)]">
                  <table className="data-table">
                    <caption className="sr-only">Facility types and modelled services</caption>
                    <thead>
                      <tr>
                        <th scope="col">Facility type</th>
                        <th scope="col">Modelled services</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meta.data.facility_types.map((type) => (
                        <tr key={type.id}>
                          <td className="font-medium">{type.label}</td>
                          <td className="text-[10px] text-[var(--ink-2)]">
                            {type.services.length
                              ? type.services.map(titleCase).join(" · ")
                              : "Not included in access calculation"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Dataset limitations
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                      Read before using a result
                    </p>
                  </div>
                  <TriangleAlert className="h-4 w-4 text-[var(--gap)]" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <ul className="mt-3 space-y-2">
                  {meta.data.dataset.limitations.map((limitation) => (
                    <li
                      key={limitation}
                      className="flex gap-2 border-b border-[var(--rule)] pb-2 text-[10px] leading-relaxed text-[var(--ink-2)] last:border-0"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--gap)]" aria-hidden="true" />
                      {limitation}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="mt-6 border border-[var(--rule-strong)] bg-[var(--sheet)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
                <div>
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Import records
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                    Add facilities (CSV or GeoJSON) or population areas (GeoJSON).
                    Imports are validated against the current district boundary.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={downloadTemplate}>
                    <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                    CSV template
                  </button>
                  <Link href="/app/methodology#data" className="btn btn-outline btn-sm">
                    Import rules
                  </Link>
                </div>
              </div>

              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,420px)_1fr]">
                <div>
                  <fieldset>
                    <legend className="field-label">Import type</legend>
                    <div className="segmented" role="group" aria-label="Import type">
                      <button
                        type="button"
                        aria-pressed={uploadKind === "facilities"}
                        onClick={() => setUploadKind("facilities")}
                      >
                        Facilities
                      </button>
                      <button
                        type="button"
                        aria-pressed={uploadKind === "areas"}
                        onClick={() => setUploadKind("areas")}
                      >
                        Population areas
                      </button>
                    </div>
                  </fieldset>
                  <div className="mt-3">
                    <label htmlFor="import-file" className="field-label">
                      File
                    </label>
                    <input
                      ref={fileInputRef}
                      id="import-file"
                      type="file"
                      accept={uploadKind === "facilities" ? ".csv,.geojson,.json" : ".geojson,.json"}
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setUploadError(null);
                        setReport(null);
                      }}
                      className="block w-full cursor-pointer rounded-[4px] border border-[var(--rule-strong)] bg-[var(--paper)] px-3 py-2 text-[10.5px] text-[var(--ink-2)] file:mr-3 file:rounded-[2px] file:border-0 file:bg-[var(--ink)] file:px-2.5 file:py-1.5 file:text-[9px] file:font-medium file:uppercase file:tracking-[0.06em] file:text-[var(--paper)]"
                    />
                    <p className="mt-1.5 text-[9px] leading-relaxed text-[var(--ink-3)]">
                      Maximum 2 MB.{" "}
                      {uploadKind === "facilities"
                        ? "CSV requires name, facility_type, lon, lat; services are optional. GeoJSON features must be Points."
                        : "GeoJSON must contain Polygon or MultiPolygon features with name and population properties."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-3"
                    onClick={submitImport}
                    disabled={uploading || !file}
                  >
                    {uploading ? (
                      <span className="spinner h-3 w-3 border-white/30 border-t-white" aria-hidden="true" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                    )}
                    {uploading ? "Validating & importing…" : "Validate & import"}
                  </button>

                  {uploadError && (
                    <p className="error-note mt-3 text-[10.5px]" role="alert">
                      {uploadError}
                    </p>
                  )}

                  {report && (
                    <div className="mt-3 border border-[var(--rule)] bg-[var(--paper)] p-3" role="status">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-[var(--ink)]">
                          Import report
                        </p>
                        <StatusBadge status={report.status} />
                      </div>
                      <div className="mono mt-2 grid grid-cols-3 gap-2 border-y border-[var(--rule)] py-2 text-[8px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                        <span>{report.rows_total} rows</span>
                        <span>{report.rows_imported} imported</span>
                        <span>{report.duplicates_skipped} duplicates</span>
                      </div>
                      {report.errors.length ? (
                        <ul className="mt-2 max-h-[180px] space-y-1 overflow-auto">
                          {report.errors.map((issue, index) => (
                            <li
                              key={`${issue.row}-${index}`}
                              className="text-[9.5px] leading-relaxed text-[var(--ink-2)]"
                            >
                              <span className="mono text-[var(--critical)]">
                                row {issue.row ?? "—"}
                                {issue.field ? ` · ${issue.field}` : ""}:
                              </span>{" "}
                              {issue.message}
                            </li>
                          ))}
                          {report.errors_truncated && (
                            <li className="text-[9px] text-[var(--ink-3)]">
                              Additional errors were truncated by the server.
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--positive)]">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Import completed without validation errors.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Recent import runs
                  </p>
                  {history.error && !history.data ? (
                    <div className="mt-2">
                      <ErrorPanel message={history.error} onRetry={history.reload} compact />
                    </div>
                  ) : history.data?.items.length ? (
                    <div className="mt-2 table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">File</th>
                            <th scope="col">Kind</th>
                            <th scope="col">Status</th>
                            <th scope="col" className="text-right">Imported</th>
                            <th scope="col">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.data.items.map((run) => (
                            <tr key={run.id}>
                              <td className="max-w-[200px] truncate" title={run.filename}>
                                {run.filename}
                              </td>
                              <td className="text-[10px] text-[var(--ink-2)]">{run.kind}</td>
                              <td><StatusBadge status={run.status} /></td>
                              <td className="num">{run.rows_imported}/{run.rows_total}</td>
                              <td className="whitespace-nowrap text-[10px] text-[var(--ink-2)]">
                                {formatDateTime(run.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 border border-dashed border-[var(--rule)] p-4 text-[10px] leading-relaxed text-[var(--ink-3)]">
                      No import runs recorded yet. A successful import adds
                      features to the dataset and is listed here with its
                      validation report.
                    </p>
                  )}
                  <div className="mt-3 border-t border-[var(--rule)] pt-2.5">
                    <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--ink-3)]">
                      <Info className="mt-px h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      Imports do not silently replace existing data. Same-name
                      facilities within 50 m and areas within 200 m are reported as
                      possible duplicates. Uploaded data is clearly marked
                      <span className="mx-1 mono text-[8px] uppercase">imported</span>
                      in facility records.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 border-t border-[var(--rule-strong)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[11px] text-[var(--ink-2)]">
                  <FileUp className="h-3.5 w-3.5 text-[var(--signal)]" strokeWidth={1.6} aria-hidden="true" />
                  No patient-identifiable data is accepted or required.
                </p>
                <Link href="/app/methodology#data" className="arrow-link text-[10.5px] text-[var(--ink-2)]">
                  Read the data rules
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
