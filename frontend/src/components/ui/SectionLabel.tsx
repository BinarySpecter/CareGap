import { cn } from "@/lib/format";

export function SectionLabel({
  index,
  children,
  light = false,
  className,
}: {
  index?: string;
  children: React.ReactNode;
  light?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        light ? "text-[var(--paper)]/55" : "text-[var(--ink-2)]",
        className,
      )}
    >
      {index && (
        <span className="mono text-[10px] tracking-[0.14em]">{index}</span>
      )}
      <span className="h-px w-7 bg-current opacity-45" aria-hidden="true" />
      <span className="mono text-[10px] uppercase tracking-[0.16em]">
        {children}
      </span>
    </div>
  );
}
