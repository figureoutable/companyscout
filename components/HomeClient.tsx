"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Image from "next/image";
import { SearchFilters } from "@/components/SearchFilters";
import { FileEnrichPanel } from "@/components/FileEnrichPanel";
import { DirectorSearchPanel } from "@/components/DirectorSearchPanel";
import { ResultsTable } from "@/components/ResultsTable";
import { ProgressBar } from "@/components/ProgressBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon, Sun, Search, FileSpreadsheet, UserSearch } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  searchCompaniesWithDirectors,
  searchCompaniesByDirectorName,
  getSearchProgress,
} from "@/app/actions";
import { enrichCompanyNumbers, getEnrichProgress } from "@/app/enrich-actions";
import type { SearchFilters as SearchFiltersType, CompanyDirectorRow } from "@/types";
import { cn } from "@/lib/utils";

const DEFAULT_FILTERS: SearchFiltersType = {
  recentResultCount: 50,
  sicCodes: [],
  companyType: "",
  addressKeyword: "",
};

const POLL_INTERVAL_MS = 400;

/** Companies per server action — keeps each request under Vercel serverless timeouts (Hobby ~10s). */
const parsedEnrichChunk = Number(process.env.NEXT_PUBLIC_ENRICH_CHUNK_SIZE);
const ENRICH_CHUNK_SIZE =
  Number.isFinite(parsedEnrichChunk) && parsedEnrichChunk > 0
    ? Math.floor(parsedEnrichChunk)
    : 6;

type MainTab = "search" | "enrich" | "director";

export default function HomeClient() {
  type CompanyStatusFilter = "all" | "not-dissolved" | "dissolved";
  const [mainTab, setMainTab] = useState<MainTab>("search");
  const [filters, setFilters] = useState<SearchFiltersType>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CompanyDirectorRow[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  /** Search tab only — do not block Enrich when a search is running in the background. */
  const [searchBusy, setSearchBusy] = useState(false);
  /** Enrich tab only — do not block Search while enriching. */
  const [enrichBusy, setEnrichBusy] = useState(false);
  /** Director tab only — do not block Search/Enrich while searching by director. */
  const [directorBusy, setDirectorBusy] = useState(false);
  const tabBusy = mainTab === "search" ? searchBusy : mainTab === "enrich" ? enrichBusy : directorBusy;
  const [progress, setProgress] = useState<{
    phase: "companies" | "directors";
    current: number;
    total: number;
    description?: string;
  } | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [companyStatusFilter, setCompanyStatusFilter] = useState<CompanyStatusFilter>("all");
  const sessionIdRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { theme, setTheme } = useTheme();

  const filteredRows = useMemo(() => {
    if (companyStatusFilter === "all") return rows;
    if (companyStatusFilter === "dissolved") {
      return rows.filter((row) => row.company_status?.toLowerCase() === "dissolved");
    }
    return rows.filter((row) => row.company_status?.toLowerCase() !== "dissolved");
  }, [rows, companyStatusFilter]);

  useEffect(() => {
    setSelectedIndices(new Set());
  }, [companyStatusFilter, rows]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setProgress(null);
  };

  const runSearch = useCallback(async (filtersOverride?: SearchFiltersType) => {
    const toSearch = filtersOverride ?? filters;
    const sessionId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = sessionId;
    setSearchBusy(true);
    setProgress({ phase: "companies", current: 0, total: 1 });
    setRows([]);
    setResultMessage(null);
    setInlineError(null);
    setSelectedIndices(new Set());

    pollRef.current = setInterval(() => {
      void (async () => {
        const p = await getSearchProgress(sessionId);
        if (p) {
          setProgress({
            phase: p.phase as "companies" | "directors",
            current: p.current,
            total: p.total,
          });
        }
      })();
    }, POLL_INTERVAL_MS);

    const result = await searchCompaniesWithDirectors(toSearch, sessionId);
    stopPolling();
    setSearchBusy(false);

    if (result.success) {
      setRows(result.rows);
      setTotalResults(result.totalResults);
      setResultMessage(result.message ?? null);
      setInlineError(null);
      toast.success(`Found ${result.rows.length} company-director row(s) from ${result.totalResults} companies.`);
    } else {
      setInlineError(result.error);
      toast.error(result.error);
    }
  }, [filters]);

  const runEnrich = useCallback(async (numbers: string[]) => {
    const sessionId = `enrich-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = sessionId;
    setEnrichBusy(true);
    setProgress({ phase: "directors", current: 0, total: Math.max(1, numbers.length), description: "Starting…" });
    setRows([]);
    setResultMessage(null);
    setInlineError(null);
    setSelectedIndices(new Set());

    const chunks: string[][] = [];
    for (let i = 0; i < numbers.length; i += ENRICH_CHUNK_SIZE) {
      chunks.push(numbers.slice(i, i + ENRICH_CHUNK_SIZE));
    }
    const useChunked = chunks.length > 1;

    if (!useChunked) {
      pollRef.current = setInterval(() => {
        void (async () => {
          const p = await getEnrichProgress(sessionId);
          if (p) {
            setProgress({
              phase: "directors",
              current: p.current,
              total: p.total,
              description: `Enriching company ${p.current} of ${p.total}…`,
            });
          }
        })();
      }, POLL_INTERVAL_MS);
    }

    const finishWithError = (msg: string) => {
      stopPolling();
      setEnrichBusy(false);
      const hint =
        /unexpected response/i.test(msg) || /failed to fetch/i.test(msg)
          ? ` Long runs often hit Vercel’s server time limit; we split the list into server requests (current chunk size: ${ENRICH_CHUNK_SIZE}). If this persists, lower NEXT_PUBLIC_ENRICH_CHUNK_SIZE in Vercel env (e.g. 4, 3, 2).`
          : "";
      setInlineError(`Enrichment failed: ${msg}${hint}`);
      toast.error(`Enrichment failed: ${msg}`);
    };

    try {
      if (!useChunked) {
        const result = await enrichCompanyNumbers(numbers, sessionId);
        stopPolling();
        setEnrichBusy(false);
        if (result.success) {
          setRows(result.rows);
          setTotalResults(new Set(result.rows.map((r) => r.company_number)).size);
          setResultMessage(result.message ?? null);
          setInlineError(null);
          if (result.rows.length === 0) {
            toast.warning(result.message ?? "No rows could be enriched.");
          } else if (result.message) {
            toast.success(`Enriched ${result.rows.length} row(s).`, { description: result.message });
          } else {
            toast.success(`Enriched ${result.rows.length} row(s) from uploaded numbers.`);
          }
        } else {
          setEnrichBusy(false);
          setInlineError(result.error);
          toast.error(result.error);
        }
        return;
      }

      const allRows: CompanyDirectorRow[] = [];
      const batchMessages: string[] = [];
      let processed = 0;

      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        const chunkSessionId = `${sessionId}-b${c}`;
        setProgress({
          phase: "directors",
          current: processed,
          total: numbers.length,
          description: `Batch ${c + 1} of ${chunks.length} (${chunk.length} companies)…`,
        });

        const result = await enrichCompanyNumbers(chunk, chunkSessionId);
        if (!result.success) {
          finishWithError(result.error);
          return;
        }
        allRows.push(...result.rows);
        if (result.message) batchMessages.push(result.message);
        processed += chunk.length;
      }

      stopPolling();
      setEnrichBusy(false);
      const combinedMessage = batchMessages.length > 0 ? batchMessages.join(" ") : null;
      setRows(allRows);
      setTotalResults(new Set(allRows.map((r) => r.company_number)).size);
      setResultMessage(combinedMessage);
      setInlineError(null);
      if (allRows.length === 0) {
        toast.warning(combinedMessage ?? "No rows could be enriched.");
      } else if (combinedMessage) {
        toast.success(`Enriched ${allRows.length} row(s).`, { description: combinedMessage });
      } else {
        toast.success(`Enriched ${allRows.length} row(s) from uploaded numbers.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network or server error.";
      finishWithError(msg);
    }
  }, []);

  const runDirectorSearch = useCallback(async (directorName: string) => {
    const sessionId = `director-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = sessionId;
    setDirectorBusy(true);
    setProgress({ phase: "companies", current: 0, total: 1, description: "Searching officer…" });
    setRows([]);
    setResultMessage(null);
    setInlineError(null);
    setSelectedIndices(new Set());

    pollRef.current = setInterval(() => {
      void (async () => {
        const p = await getSearchProgress(sessionId);
        if (p) {
          setProgress({
            phase: p.phase as "companies" | "directors",
            current: p.current,
            total: p.total,
            description: p.phase === "companies" ? "Searching officer…" : "Loading active appointments…",
          });
        }
      })();
    }, POLL_INTERVAL_MS);

    const result = await searchCompaniesByDirectorName(directorName, sessionId);
    stopPolling();
    setDirectorBusy(false);

    if (result.success) {
      setRows(result.rows);
      setTotalResults(result.totalResults);
      setResultMessage(result.message ?? null);
      setInlineError(null);
      if (result.rows.length > 0) {
        toast.success(`Found ${result.rows.length} active company appointment(s) for "${directorName.trim()}".`);
      } else {
        toast.warning(result.message ?? "No active company appointments found.");
      }
    } else {
      setInlineError(result.error);
      toast.error(result.error);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 dark:border-border/30 dark:bg-background/90 dark:supports-[backdrop-filter]:bg-background/75">
        <div className="container flex min-h-[3.25rem] flex-wrap items-center gap-3 py-2.5 sm:min-h-16 sm:flex-nowrap sm:gap-4 sm:py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <Image
                src="/logo.png"
                alt="Company Scout"
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 object-contain"
                priority
              />
              <div className="flex min-w-0 flex-col justify-center gap-0.5">
                <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  Company Scout
                </h1>
                <p className="text-xs font-medium leading-snug text-muted-foreground sm:text-[0.8125rem] sm:leading-normal">
                  Explore UK Companies & Directors
                </p>
              </div>
            </div>
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 p-1 dark:bg-muted/25"
              role="tablist"
              aria-label="Main navigation"
            >
              <Button
                type="button"
                role="tab"
                aria-label="Search tab"
                aria-selected={mainTab === "search"}
                variant={mainTab === "search" ? "default" : "ghost"}
                size="sm"
                className={cn("gap-1.5 px-3", mainTab === "search" && "shadow-sm")}
                onClick={() => setMainTab("search")}
              >
                <Search className="size-4 shrink-0" />
                <span className="hidden sm:inline">Search</span>
              </Button>
              <Button
                type="button"
                role="tab"
                aria-label="Enrich from file tab"
                aria-selected={mainTab === "enrich"}
                variant={mainTab === "enrich" ? "default" : "ghost"}
                size="sm"
                className={cn("gap-1.5 px-3", mainTab === "enrich" && "shadow-sm")}
                onClick={() => setMainTab("enrich")}
              >
                <FileSpreadsheet className="size-4 shrink-0" />
                <span className="hidden min-[480px]:inline">Enrich from file</span>
                <span className="inline min-[480px]:hidden">Enrich</span>
              </Button>
              <Button
                type="button"
                role="tab"
                aria-label="Director search tab"
                aria-selected={mainTab === "director"}
                variant={mainTab === "director" ? "default" : "ghost"}
                size="sm"
                className={cn("gap-1.5 px-3", mainTab === "director" && "shadow-sm")}
                onClick={() => setMainTab("director")}
              >
                <UserSearch className="size-4 shrink-0" />
                <span className="hidden sm:inline">Director Search</span>
                <span className="inline sm:hidden">Director</span>
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="relative ml-auto shrink-0 border-border/80 bg-card/50 dark:bg-card/30"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          </Button>
        </div>
      </header>

      <main className="container py-6 sm:py-8">
        <div
          className={cn(
            "gap-4 lg:gap-5",
            mainTab === "enrich"
              ? "flex flex-col"
              : "grid items-start lg:grid-cols-[minmax(280px,320px)_1fr] lg:items-stretch"
          )}
        >
          <aside
            className={cn(
              (mainTab === "search" || mainTab === "director") && "lg:sticky lg:top-[4.5rem] lg:self-start"
            )}
          >
            {mainTab === "search" ? (
              <SearchFilters
                filters={filters}
                onFiltersChange={setFilters}
                onSearch={runSearch}
                isSearching={searchBusy}
              />
            ) : mainTab === "director" ? (
              <DirectorSearchPanel onSearch={runDirectorSearch} isSearching={directorBusy} />
            ) : (
              <FileEnrichPanel onNumbersReady={runEnrich} disabled={enrichBusy} />
            )}
          </aside>

          <div
            className={cn(
              "min-w-0 w-full",
              (mainTab === "search" || mainTab === "director") && "lg:flex lg:h-full lg:min-h-0 lg:flex-col"
            )}
          >
            <Card
              className={cn(
                "gap-0 overflow-hidden border-border/80 p-0 shadow-sm dark:border-border/50",
                (mainTab === "search" || mainTab === "director") && "lg:flex lg:h-full lg:min-h-0 lg:flex-1 lg:flex-col"
              )}
            >
              <CardContent
                className={cn(
                  "space-y-0 p-0",
                  (mainTab === "search" || mainTab === "director") && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
                )}
              >
                {progress && tabBusy && (
                  <div className="shrink-0 border-b border-border/60 bg-muted/15 px-4 py-4 dark:bg-muted/10 sm:px-6">
                    <ProgressBar
                      phase={progress.phase}
                      current={progress.current}
                      total={progress.total}
                      description={progress.description}
                    />
                  </div>
                )}

                <div
                  className={cn(
                    "space-y-5 p-4 sm:p-6",
                    (mainTab === "search" || mainTab === "director") && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
                  )}
                >
                  {inlineError && (
                    <div className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {inlineError}
                    </div>
                  )}

                  {!tabBusy && rows.length > 0 && (
                    <div className="shrink-0 space-y-1 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 dark:bg-muted/10">
                      <p className="text-sm text-muted-foreground">
                        Showing <span className="font-medium text-foreground">{filteredRows.length}</span> of{" "}
                        <span className="font-medium text-foreground">{rows.length}</span> row(s) from{" "}
                        <span className="font-medium text-foreground">{totalResults}</span> companies
                      </p>
                      {resultMessage && (
                        <p className="text-sm text-amber-700 dark:text-amber-400">{resultMessage}</p>
                      )}
                    </div>
                  )}

                  {!tabBusy && rows.length > 0 && (
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Company status</span>
                      <Select
                        value={companyStatusFilter}
                        onValueChange={(value) => setCompanyStatusFilter(value as CompanyStatusFilter)}
                      >
                        <SelectTrigger className="h-9 w-[210px]">
                          <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="not-dissolved">Not dissolved</SelectItem>
                          <SelectItem value="dissolved">Dissolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <ResultsTable
                    embedded
                    fillHeight={mainTab === "search" || mainTab === "director"}
                    rows={filteredRows}
                    selectedIndices={selectedIndices}
                    onSelectionChange={setSelectedIndices}
                    loading={tabBusy}
                    showAccountsColumns={mainTab === "enrich" || mainTab === "director"}
                    emptyMessage={
                      mainTab === "enrich"
                        ? "Upload a file with company numbers, then click Enrich."
                        : mainTab === "director"
                          ? "Search by exact director full name to load active company appointments."
                        : "No results. Try adjusting your filters."
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
