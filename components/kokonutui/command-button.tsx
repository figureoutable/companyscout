"use client";

import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Kokonut UI – Command Button (jungle palette)
 * @see https://kokonutui.com — MIT, @dorianbaffier
 */

export default function CommandButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      {...props}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg border p-2",
        "border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-emerald-100/80",
        "dark:border-emerald-900/60 dark:from-emerald-950/80 dark:to-emerald-900/50",
        "hover:border-emerald-300 dark:hover:border-emerald-700",
        "transition-all duration-300 ease-out",
        className
      )}
    >
      <Command
        className={cn(
          "size-4 text-emerald-800 transition-all duration-300 dark:text-emerald-200",
          "group-hover:scale-110 group-hover:rotate-[-4deg] group-active:scale-95"
        )}
      />
      <span className="text-sm text-emerald-900 dark:text-emerald-100">{children || "CMD + K"}</span>
      <span
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-gradient-to-r from-amber-500/0 via-amber-500/15 to-amber-500/0",
          "translate-x-[-100%] transition-transform duration-500 ease-out group-hover:translate-x-[100%]"
        )}
      />
    </Button>
  );
}
