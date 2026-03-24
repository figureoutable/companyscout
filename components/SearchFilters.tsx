"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import type { SearchFilters as SearchFiltersType } from "@/types";

const MIN_N = 1;
const MAX_N = 2000;

function clampN(n: number): number {
  if (Number.isNaN(n) || n < MIN_N) return 50;
  if (n > MAX_N) return MAX_N;
  return Math.floor(n);
}

const COMPANY_TYPES_LIST = [
  { value: "", label: "Any" },
  { value: "ltd", label: "Private limited (ltd)" },
  { value: "plc", label: "Public limited (plc)" },
  { value: "llp", label: "Limited liability partnership (llp)" },
  { value: "private-limited-guarant-nsc-limited-exemption", label: "Private limited (guarant nsc)" },
  { value: "private-unlimited", label: "Private unlimited" },
  { value: "limited-partnership", label: "Limited partnership" },
  { value: "oversea-entity", label: "Overseas entity" },
] as const;

export interface SearchFiltersProps {
  filters: SearchFiltersType;
  onFiltersChange: (f: SearchFiltersType) => void;
  onSearch: (filters: SearchFiltersType) => void;
  isSearching: boolean;
}

export function SearchFilters({
  filters,
  onFiltersChange,
  onSearch,
  isSearching,
}: SearchFiltersProps) {
  const [countInput, setCountInput] = React.useState(String(filters.recentResultCount));
  React.useEffect(() => {
    setCountInput(String(filters.recentResultCount));
  }, [filters.recentResultCount]);

  const commitCount = () => {
    const n = parseInt(countInput, 10);
    const clamped = clampN(Number.isNaN(n) ? 50 : n);
    setCountInput(String(clamped));
    onFiltersChange({ ...filters, recentResultCount: clamped });
  };

  return (
    <Card className="w-full border-border/80 shadow-sm dark:border-border/50">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          Filters
        </CardTitle>
        <p className="text-xs text-muted-foreground">Search Companies House by recency and filters.</p>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="space-y-2">
          <Label htmlFor="recent-count">Most recent results</Label>
          <p className="text-xs text-muted-foreground">
            Newest incorporations first — up to {MIN_N}–{MAX_N} companies (then directors). Scans
            backwards day by day (max ~3 years). Large runs take a long time — use{" "}
            <code className="rounded bg-muted px-1">npm run extract-2000</code> for a CSV in the background.
          </p>
          <div className="flex items-center gap-2">
            <Input
              id="recent-count"
              type="number"
              inputMode="numeric"
              min={MIN_N}
              max={MAX_N}
              className="max-w-[8rem]"
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={commitCount}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                  commitCount();
                }
              }}
            />
            <span className="text-sm text-muted-foreground shrink-0">companies</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>SIC codes (comma-separated)</Label>
          <Input
            placeholder="e.g. 62012, 62020"
            value={filters.sicCodes.join(", ")}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                sicCodes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Company type</Label>
          <Select
            value={filters.companyType || "any"}
            onValueChange={(v) => onFiltersChange({ ...filters, companyType: v === "any" || v == null ? "" : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_TYPES_LIST.map(({ value, label }) => (
                <SelectItem key={value || "any"} value={value || "any"}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Registered address keyword</Label>
          <Input
            placeholder="e.g. Surrey, London"
            value={filters.addressKeyword}
            onChange={(e) => onFiltersChange({ ...filters, addressKeyword: e.target.value })}
          />
        </div>

        <Button
          className="w-full"
          onClick={() => {
            const n = parseInt(countInput, 10);
            const clamped = clampN(Number.isNaN(n) ? 50 : n);
            setCountInput(String(clamped));
            const next = { ...filters, recentResultCount: clamped };
            onFiltersChange(next);
            onSearch(next);
          }}
          disabled={isSearching}
        >
          {isSearching ? "Searching…" : "Search"}
        </Button>
      </CardContent>
    </Card>
  );
}
