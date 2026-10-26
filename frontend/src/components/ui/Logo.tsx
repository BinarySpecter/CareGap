import Link from "next/link";
import careGapLogo from "../assets/caregap-logo.webp";
import { cn } from "@/lib/format";

interface LogoProps {
  href?: string;
  variant?: "light" | "dark";
  compact?: boolean;
  className?: string;
}

export function CareGapMark({ className }: { className?: string }) {
  return (
    <img
      src="/caregap-logo.webp"
      alt="CareGap mark"
      className={cn("h-12 w-12 object-contain", className)}
    />
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
          "h-[40px] w-[40px] shrink-0",
          variant === "dark" ? "text-[var(--paper)]" : "text-[var(--ink)]",
        )}
      />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "serif text-[23px] font-bold leading-none tracking-[-0.035em]",
              variant === "dark" ? "text-[var(--paper)]" : "text-[var(--ink)]",
            )}
          >
            CareGap
          </span>
          <span
            className={cn(
              "mono text-[8px] uppercase tracking-[0.2em]",
              variant === "dark" ? "text-[var(--paper)]/45" : "text-[var(--ink-2)]",
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
