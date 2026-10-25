import Link from "next/link";

import { cn } from "@/lib/format";

interface LogoProps {
  href?: string;
  variant?: "light" | "dark";
  compact?: boolean;
  className?: string;
}

export function CareGapMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="CareGap mark"
      className={cn("h-8 w-8", className)}
    >
      <rect width="64" height="64" rx="9" fill="currentColor" />
      <path
        d="M8 20h48M8 32h48M8 44h48M20 8v48M32 8v48M44 8v48"
        stroke="var(--paper)"
        strokeOpacity=".16"
        strokeWidth=".8"
      />
      <circle cx="32" cy="32" r="17" fill="none" stroke="var(--signal-soft)" strokeOpacity=".5" strokeWidth="1.1" />
      <circle cx="32" cy="32" r="10" fill="none" stroke="var(--signal-bright)" strokeWidth="1.4" />
      <circle cx="32" cy="32" r="3" fill="var(--gap-soft)" />
      <path d="M32 8v9M32 47v9M8 32h9M47 32h9" stroke="var(--paper)" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({
  href = "/",
  variant = "light",
  compact = false,
  className,
}: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <CareGapMark
        className={cn(
          "h-[30px] w-[30px] shrink-0",
          variant === "dark" ? "text-[var(--paper)]" : "text-[var(--ink)]",
        )}
      />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "serif text-[23px] font-semibold leading-none tracking-[-0.035em]",
              variant === "dark" ? "text-[var(--paper)]" : "text-[var(--ink)]",
            )}
          >
            CareGap
          </span>
          <span
            className={cn(
              "mono text-[8px] uppercase tracking-[0.2em]",
              variant === "dark" ? "text-[var(--paper)]/45" : "text-[var(--ink-3)]",
            )}
          >
            Atlas
          </span>
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="CareGap home" className="inline-flex">
      {content}
    </Link>
  );
}
