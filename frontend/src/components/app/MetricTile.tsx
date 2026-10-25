import { cn } from "@/lib/format";

interface MetricTileProps {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: "default" | "gap" | "critical" | "positive" | "light";
  className?: string;
  icon?: React.ReactNode;
}

const toneClasses = {
  default: "text-[var(--ink)]",
  gap: "text-[var(--gap)]",
  critical: "text-[var(--critical)]",
  positive: "text-[var(--positive)]",
  light: "text-[var(--paper)]",
};

export function MetricTile({
  label,
  value,
  unit,
  note,
  tone = "default",
  className,
  icon,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        "flex min-h-[112px] flex-col justify-between border-t border-[var(--rule)] py-4 pr-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className={cn("kpi-value", toneClasses[tone])}>{value}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {note && (
        <p className="mt-2 text-[10.5px] leading-snug text-[var(--ink-3)]">{note}</p>
      )}
    </div>
  );
}

export function MetricRow({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "gap" | "critical" | "positive";
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--rule)] py-2.5 last:border-0">
      <div>
        <p className="text-[11.5px] text-[var(--ink-2)]">{label}</p>
        {note && <p className="mt-0.5 text-[9.5px] text-[var(--ink-3)]">{note}</p>}
      </div>
      <p
        className={cn(
          "mono whitespace-nowrap text-right text-[12px] font-medium",
          tone ? toneClasses[tone] : "text-[var(--ink)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}
