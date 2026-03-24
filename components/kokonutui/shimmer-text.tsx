"use client";

/**
 * Kokonut UI–style shimmer text (jungle-themed gradient), CSS-only.
 * Avoids motion/motion-dom which can break Next.js webpack vendor chunks on the server.
 * @see https://kokonutui.com — MIT, @dorianbaffier
 */

import { cn } from "@/lib/utils";

interface ShimmerTextProps {
  text: string;
  className?: string;
}

export default function ShimmerText({ text, className }: ShimmerTextProps) {
  return (
    <div className="relative inline-block overflow-hidden animate-jungle-shimmer-enter">
      <span
        className={cn(
          "inline-block bg-[length:200%_100%] bg-gradient-to-r from-emerald-900 via-amber-600 to-emerald-900 bg-clip-text font-semibold text-transparent animate-jungle-shimmer-bg",
          "dark:from-emerald-100 dark:via-amber-200 dark:to-emerald-100",
          className
        )}
      >
        {text}
      </span>
    </div>
  );
}
