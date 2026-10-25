import { cn } from "@/lib/format";

interface PageHeaderProps {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  index,
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("border-b border-[var(--rule)] pb-6", className)}>
      <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div className="max-w-[720px]">
          <div className="mb-3 flex items-center gap-3">
            <span className="mono text-[10px] text-[var(--ink-3)]">{index}</span>
            <span className="h-px w-7 bg-[var(--rule-strong)]" aria-hidden="true" />
            <span className="mono text-[9.5px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
              {eyebrow}
            </span>
          </div>
          <h1 className="display text-[clamp(2.05rem,1.55rem+1.8vw,3.1rem)] text-[var(--ink)]">
            {title}
          </h1>
          <p className="measure mt-3 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
            {description}
          </p>
          {aside}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
