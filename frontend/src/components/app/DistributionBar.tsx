import { formatCompact, formatNumber } from "@/lib/format";
import type { DistributionBucket } from "@/lib/types";

const BUCKET_COLORS = [
  "#0b5d56",
  "#3f887b",
  "#8aab87",
  "#d5a05a",
  "#b76f1b",
  "#8e3b32",
  "#3b4644",
];

export function DistributionBar({
  distribution,
  threshold,
}: {
  distribution: DistributionBucket[];
  threshold: number;
}) {
  const total = distribution.reduce((sum, bucket) => sum + bucket.population, 0);
  if (!total) {
    return (
      <p className="text-[11px] text-[var(--ink-3)]">
        No population data is available for this dataset.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-[1px]" role="img" aria-label={
        distribution
          .map((bucket) => `${bucket.bucket}: ${formatNumber(bucket.population)} people`)
          .join(", ")
      }>
        {distribution.map((bucket, index) => (
          <div
            key={bucket.bucket}
            style={{
              width: `${(bucket.population / total) * 100}%`,
              background: BUCKET_COLORS[index] ?? BUCKET_COLORS.at(-1),
            }}
            title={`${bucket.bucket}: ${formatNumber(bucket.population)} people in ${bucket.areas} areas`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 xl:grid-cols-7">
        {distribution.map((bucket, index) => (
          <div key={bucket.bucket} className="flex items-start gap-1.5">
            <span
              className="mt-[3px] h-2 w-2 shrink-0 rounded-[1px]"
              style={{ background: BUCKET_COLORS[index] ?? BUCKET_COLORS.at(-1) }}
              aria-hidden="true"
            />
            <div>
              <p className="mono text-[7.5px] uppercase leading-tight tracking-[0.06em] text-[var(--ink-3)]">
                {bucket.bucket}
                {bucket.bucket.includes(String(threshold)) && (
                  <span className="ml-1 text-[var(--signal)]">• T</span>
                )}
              </p>
              <p className="mono mt-0.5 text-[9.5px] text-[var(--ink-2)]">
                {formatCompact(bucket.population)}
                <span className="ml-1 text-[7.5px] text-[var(--ink-3)]">
                  / {bucket.areas} areas
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-[var(--ink-3)]">
        Population by modelled travel-time band. The selected {threshold}-minute
        threshold is a policy choice, not a clinical constant.
      </p>
    </div>
  );
}
