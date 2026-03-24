"use client";

import { Progress, ProgressIndicator } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  phase: "companies" | "directors";
  current: number;
  total: number;
  className?: string;
  /** If set, replaces the default phase label (e.g. file enrichment). */
  description?: string;
}

export function ProgressBar({ phase, current, total, className, description }: ProgressBarProps) {
  const value = total > 0 ? Math.round((current / total) * 100) : 0;
  const label =
    description ??
    (phase === "companies"
      ? "Fetching companies…"
      : `Fetching directors: ${current} of ${total} companies`);

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <Progress value={value}>
        <ProgressIndicator />
      </Progress>
    </div>
  );
}

export function ResultsTableSkeleton() {
  return (
    <div className="space-y-3 w-full">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
