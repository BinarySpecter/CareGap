import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/format";

interface LogoProps {
  href?: string;
  variant?: "light" | "dark";
  compact?: boolean;
  className?: string;
}

export function CareGapMark({ className }: { className?: string }) {
  return (
    <Image
      src="/caregap-logo.webp"
      alt="CareGap mark"
      width={32}
      height={32}
      className={cn("h-8 w-8 object-contain", className)}
      priority
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
