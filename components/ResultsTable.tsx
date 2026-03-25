"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/ExportButton";
import type { CompanyDirectorRow } from "@/types";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export interface ResultsTableProps {
  rows: CompanyDirectorRow[];
  selectedIndices: Set<number>;
  onSelectionChange: (indices: Set<number>) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** When true (Enrich tab): accounts/confirmation overdue + derived name/company columns. */
  showAccountsColumns?: boolean;
  /** When true, no outer card frame — use inside a parent panel (e.g. with progress above). */
  embedded?: boolean;
  /** When true with embedded, grow to fill the panel (e.g. match sidebar height on search layout). */
  fillHeight?: boolean;
}

function OverdueBadgeCell({ value }: { value: string | undefined }) {
  if (value === "Yes") {
    return (
      <Badge variant="destructive" className="text-xs">
        Yes
      </Badge>
    );
  }
  if (value === "No") {
    return (
      <Badge variant="secondary" className="text-xs">
        No
      </Badge>
    );
  }
  return <span className="text-muted-foreground text-sm">Unknown</span>;
}

export function ResultsTable({
  rows,
  selectedIndices,
  onSelectionChange,
  loading,
  emptyMessage = "No results. Try adjusting your filters.",
  showAccountsColumns = false,
  embedded = false,
  fillHeight = false,
}: ResultsTableProps) {
  const toggleOne = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (selectedIndices.size === rows.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(rows.map((_, i) => i)));
  };

  if (loading) {
    return (
      <div
        className={cn(
          "space-y-3",
          embedded ? "py-1" : "rounded-lg border bg-card p-4",
          embedded && fillHeight && "flex min-h-0 flex-1 flex-col"
        )}
      >
        <div className="h-8 shrink-0 bg-muted animate-pulse rounded" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/60 animate-pulse rounded" />
        ))}
        {embedded && fillHeight && <div className="min-h-0 flex-1" aria-hidden />}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "text-center text-muted-foreground",
          embedded ? "text-sm" : "rounded-lg border bg-card p-12",
          embedded && !fillHeight && "py-14 sm:py-16",
          embedded && fillHeight && "flex min-h-0 flex-1 flex-col items-center justify-center py-8"
        )}
      >
        <p className="max-w-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-4",
        embedded && fillHeight && "flex min-h-0 flex-1 flex-col"
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ExportButton
          rows={rows}
          selectedIndices={selectedIndices}
          variant="selected"
          disabled={selectedIndices.size === 0}
        />
        <ExportButton rows={rows} selectedIndices={selectedIndices} variant="all" />
      </div>
      <div
        className={cn(
          "overflow-x-auto rounded-lg border",
          embedded && fillHeight && "min-h-0 flex-1 overflow-auto"
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={rows.length > 0 && selectedIndices.size === rows.length}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Company name</TableHead>
              <TableHead>Company number</TableHead>
              <TableHead>Incorporation date</TableHead>
              <TableHead>SIC codes</TableHead>
              <TableHead>Registered address</TableHead>
              {showAccountsColumns && (
                <>
                  <TableHead>Accounts overdue</TableHead>
                  <TableHead>Accounts due on</TableHead>
                  <TableHead>Confirmation overdue</TableHead>
                  <TableHead>Confirmation due on</TableHead>
                </>
              )}
              <TableHead>Director name(s)</TableHead>
              {showAccountsColumns && (
                <>
                  <TableHead>Director (first first)</TableHead>
                  <TableHead>Company (no Ltd)</TableHead>
                  <TableHead>Company + city</TableHead>
                  <TableHead>Company + director</TableHead>
                  <TableHead>Director + company</TableHead>
                  <TableHead>Director + company (LinkedIn)</TableHead>
                </>
              )}
              <TableHead>Director occupation</TableHead>
              <TableHead>Director nationality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.company_number}-${row.director_name}-${index}`}>
                <TableCell>
                  <Checkbox
                    checked={selectedIndices.has(index)}
                    onCheckedChange={() => toggleOne(index)}
                    aria-label={`Select row ${index + 1}`}
                  />
                </TableCell>
                <TableCell>
                  <a
                    href={row.company_house_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {row.company_name}
                    <ExternalLink className="size-3" />
                  </a>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.company_number}</TableCell>
                <TableCell>{row.incorporation_date}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[140px]">
                    {row.sic_codes
                      ? row.sic_codes.split(";").map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s.trim()}
                          </Badge>
                        ))
                      : "—"}
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate" title={row.registered_address}>
                  {row.registered_address || "—"}
                </TableCell>
                {showAccountsColumns && (
                  <>
                    <TableCell>
                      <OverdueBadgeCell value={row.accounts_overdue} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {row.accounts_next_due_on || "—"}
                    </TableCell>
                    <TableCell>
                      <OverdueBadgeCell value={row.confirmation_overdue} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {row.confirmation_next_due_on || "—"}
                    </TableCell>
                  </>
                )}
                <TableCell>{row.director_name || "—"}</TableCell>
                {showAccountsColumns && (
                  <>
                    <TableCell className="max-w-[160px] text-sm whitespace-normal">
                      {row.director_name_first_first || "—"}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm" title={row.company_name_clean}>
                      {row.company_name_clean || "—"}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm" title={row.company_name_clean_with_city}>
                      {row.company_name_clean_with_city || "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm" title={row.company_clean_and_director}>
                      {row.company_clean_and_director || "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm" title={row.director_and_company_clean}>
                      {row.director_and_company_clean || "—"}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm" title={row.director_company_linkedin}>
                      {row.director_company_linkedin || "—"}
                    </TableCell>
                  </>
                )}
                <TableCell>{row.director_occupation || "—"}</TableCell>
                <TableCell>{row.director_nationality || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
