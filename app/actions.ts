"use server";

import { createCompaniesHouseClient } from "@/lib/companiesHouse";
import { buildDerivedRowFields } from "@/lib/rowDerivatives";
import type { CHCompanySearchItem, CompanyDirectorRow, SearchFilters } from "@/types";

const progressStore = new Map<
  string,
  { current: number; total: number; phase: "companies" | "directors" }
>();

const DEFAULT_RECENT_COUNT = 50;
const MIN_RECENT = 1;
const MAX_RECENT = 2000;
/** Stop scanning backwards after this many days (sparse filters may yield fewer than N). */
const MAX_DAY_SCAN = 1095;

function updateProgress(
  sessionId: string,
  phase: "companies" | "directors",
  current: number,
  total: number
) {
  progressStore.set(sessionId, { phase, current, total });
}

function clampRecentCount(n: number): number {
  const x = Math.floor(Number(n));
  if (Number.isNaN(x) || x < MIN_RECENT) return DEFAULT_RECENT_COUNT;
  return Math.min(MAX_RECENT, x);
}

function normalizeDirectorName(name: string): string {
  return name.replace(/,/g, " ").trim().replace(/\s+/g, " ").toUpperCase();
}

function officerNameVariants(name: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeDirectorName(name);
  if (normalized) variants.add(normalized);
  if (name.includes(",")) {
    const parts = name.split(",");
    if (parts.length >= 2) {
      const family = parts[0]?.trim() ?? "";
      const given = parts.slice(1).join(" ").trim();
      const reordered = normalizeDirectorName(`${given} ${family}`);
      if (reordered) variants.add(reordered);
    }
  }
  return [...variants];
}

function resolveAppointmentsPath(links: { self?: string; officer?: { appointments?: string } } | undefined): string | null {
  const explicit = links?.officer?.appointments?.trim();
  if (explicit) return explicit;
  const self = links?.self?.trim();
  if (!self) return null;
  if (self.endsWith("/appointments")) return self;
  if (self.startsWith("/officers/")) return `${self}/appointments`;
  return null;
}

export async function getSearchProgress(sessionId: string): Promise<{
  current: number;
  total: number;
  phase: string;
} | null> {
  const p = progressStore.get(sessionId);
  if (!p) return null;
  return { current: p.current, total: p.total, phase: p.phase };
}

/**
 * Walk backwards day-by-day from today so the first N companies are the N most recent
 * incorporations matching filters (newest incorporation date first).
 */
export async function searchCompaniesWithDirectors(
  filters: SearchFilters,
  sessionId: string
): Promise<
  | { success: true; rows: CompanyDirectorRow[]; totalResults: number; message?: string }
  | { success: false; error: string }
> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    return { success: false, error: "COMPANIES_HOUSE_API_KEY is not set." };
  }

  const delayMs = Number(process.env.OFFICER_FETCH_DELAY_MS) || 200;
  const ch = createCompaniesHouseClient(apiKey, delayMs);
  const wantN = clampRecentCount(filters.recentResultCount);
  const itemsPerPage = ch.ITEMS_PER_PAGE;

  try {
    updateProgress(sessionId, "companies", 0, MAX_DAY_SCAN);

    const collected: CHCompanySearchItem[] = [];
    const seen = new Set<string>();
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    let hadPageErrors = false;

    for (let dayIndex = 0; dayIndex < MAX_DAY_SCAN && collected.length < wantN; dayIndex++) {
      const ymd = day.toISOString().slice(0, 10);
      updateProgress(sessionId, "companies", dayIndex + 1, MAX_DAY_SCAN);

      let startIndex = 0;
      let firstCompanyNumberOfPrevPage: string | null = null;

      while (collected.length < wantN) {
        const params: Record<string, string | number> = {
          incorporated_from: ymd,
          incorporated_to: ymd,
          start_index: startIndex,
          items_per_page: itemsPerPage,
        };
        if (filters.sicCodes.length) params.sic_codes = filters.sicCodes.join(",");
        if (filters.companyType) params.company_type = filters.companyType;
        if (filters.addressKeyword.trim()) params.location = filters.addressKeyword.trim();

        let res: Awaited<ReturnType<typeof ch.advancedSearch>> | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            res = await ch.advancedSearch(params as Parameters<typeof ch.advancedSearch>[0]);
            break;
          } catch (e: unknown) {
            const status = (e as { response?: { status?: number } })?.response?.status;
            if ((status === 500 || status === 502) && attempt < 3) {
              const wait = 3000 * (attempt + 1);
              console.warn(
                `[searchCompaniesWithDirectors] Companies House API ${status} for ${ymd} start_index=${startIndex}, retry in ${wait}ms…`
              );
              await ch.sleep(wait);
            } else {
              hadPageErrors = true;
              const label = status ?? "unknown";
              console.warn(
                `[searchCompaniesWithDirectors] Giving up on page for ${ymd} at start_index=${startIndex} (status ${label}). Continuing with companies fetched so far.`
              );
              res = { items: [], total_results: 0, page_number: 0, items_per_page: 0 };
              break;
            }
          }
        }
        if (!res) break;
        const items = res.items ?? [];

        if (items.length === 0) break;

        const firstId = items[0]?.company_number ?? "";
        if (firstCompanyNumberOfPrevPage !== null && firstId === firstCompanyNumberOfPrevPage) break;
        firstCompanyNumberOfPrevPage = firstId;

        for (const c of items) {
          if (seen.has(c.company_number)) continue;
          seen.add(c.company_number);
          collected.push(c);
          if (collected.length >= wantN) break;
        }

        startIndex += items.length;
        const totalOnDay = res.total_results ?? 0;
        if (totalOnDay > 0 && startIndex >= totalOnDay) break;
      }

      day.setDate(day.getDate() - 1);
    }

    const topCompanies = collected.slice(0, wantN);
    let message: string | undefined;
    if (collected.length < wantN) {
      message = `Only ${collected.length} companies matched in the last ${MAX_DAY_SCAN} days (you asked for ${wantN}). Try loosening SIC, location, or type.`;
    }
    if (hadPageErrors) {
      const extra =
        " Companies House had internal errors on part of this search. Results may be incomplete for some days.";
      message = message ? message + extra : extra.trim();
    }

    const allRows: CompanyDirectorRow[] = [];
    updateProgress(sessionId, "directors", 0, topCompanies.length);

    for (let i = 0; i < topCompanies.length; i++) {
      const company = topCompanies[i];
      updateProgress(sessionId, "directors", i + 1, topCompanies.length);
      const officersRes = await ch.getOfficers(company.company_number);
      await ch.sleep(delayMs);

      const directors = (officersRes?.items ?? []).filter(
        (o) => o.officer_role?.toLowerCase() === "director"
      );

      const regAddress = ch.formatAddress(company.registered_office_address);
      const sicStr = (company.sic_codes ?? []).join("; ");
      const incorporationDate = company.date_of_creation ?? "";
      const locality = company.registered_office_address?.locality;

      if (directors.length === 0) {
        allRows.push({
          company_number: company.company_number,
          company_name: company.company_name ?? "",
          incorporation_date: incorporationDate,
          sic_codes: sicStr,
          registered_address: regAddress,
          director_name: "",
          director_dob_month_year: "",
          director_nationality: "",
          director_occupation: "",
          director_address: "",
          company_house_url: `https://find-and-update.company-information.service.gov.uk/company/${company.company_number}`,
          ...buildDerivedRowFields({
            company_name: company.company_name ?? "",
            director_name: "",
            address_locality: locality,
          }),
        });
      } else {
        for (const d of directors) {
          const dob =
            d.date_of_birth?.month && d.date_of_birth?.year
              ? `${d.date_of_birth.month}/${d.date_of_birth.year}`
              : "";
          allRows.push({
            company_number: company.company_number,
            company_name: company.company_name ?? "",
            incorporation_date: incorporationDate,
            sic_codes: sicStr,
            registered_address: regAddress,
            director_name: d.name ?? "",
            director_dob_month_year: dob,
            director_nationality: d.nationality ?? "",
            director_occupation: d.occupation ?? "",
            director_address: ch.formatAddress(d.address),
            company_house_url: `https://find-and-update.company-information.service.gov.uk/company/${company.company_number}`,
            ...buildDerivedRowFields({
              company_name: company.company_name ?? "",
              director_name: d.name ?? "",
              address_locality: locality,
            }),
          });
        }
      }
    }

    allRows.sort((a, b) => (b.incorporation_date || "").localeCompare(a.incorporation_date || ""));

    progressStore.delete(sessionId);
    return {
      success: true,
      rows: allRows,
      totalResults: topCompanies.length,
      message,
    };
  } catch (err: unknown) {
    progressStore.delete(sessionId);
    const message = err instanceof Error ? err.message : "Companies House API request failed.";
    return { success: false, error: message };
  }
}

/**
 * Exact-name search via live Companies House officer search + appointments endpoint.
 * Returns only active director appointments (not resigned).
 */
export async function searchCompaniesByDirectorName(
  directorName: string,
  sessionId: string
): Promise<
  | { success: true; rows: CompanyDirectorRow[]; totalResults: number; message?: string }
  | { success: false; error: string }
> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    return { success: false, error: "COMPANIES_HOUSE_API_KEY is not set." };
  }

  const input = directorName.trim();
  if (!input) {
    return { success: false, error: "Please enter a director full name." };
  }

  const delayMs = Number(process.env.OFFICER_FETCH_DELAY_MS) || 200;
  const ch = createCompaniesHouseClient(apiKey, delayMs);
  const targetName = normalizeDirectorName(input);

  try {
    updateProgress(sessionId, "companies", 0, 1);
    const search = await ch.searchOfficersByName(input);
    if (!search) {
      progressStore.delete(sessionId);
      return { success: false, error: "Officer search failed. Please try again." };
    }

    const exactOfficers = search.items.filter((item) => {
      const candidates = officerNameVariants(item.title ?? item.name ?? "");
      return candidates.includes(targetName);
    });
    if (exactOfficers.length === 0) {
      progressStore.delete(sessionId);
      return {
        success: true,
        rows: [],
        totalResults: 0,
        message: "No exact full-name officer match was found.",
      };
    }
    updateProgress(sessionId, "directors", 0, exactOfficers.length);

    const activeDirectorAppointments: NonNullable<
      Awaited<ReturnType<typeof ch.getOfficerAppointments>>
    >["items"] = [];
    const seenOfficerPath = new Set<string>();

    for (let i = 0; i < exactOfficers.length; i++) {
      const appointmentsPath = resolveAppointmentsPath(exactOfficers[i]?.links);
      updateProgress(sessionId, "directors", i + 1, exactOfficers.length);
      if (!appointmentsPath || seenOfficerPath.has(appointmentsPath)) continue;
      seenOfficerPath.add(appointmentsPath);

      const appointmentsRes = await ch.getOfficerAppointments(appointmentsPath);
      if (!appointmentsRes) continue;
      activeDirectorAppointments.push(
        ...appointmentsRes.items.filter((item) => {
          const role = item.officer_role?.toLowerCase();
          return role === "director" && !item.resigned_on && item.appointed_to?.company_number;
        })
      );
      await ch.sleep(delayMs);
    }

    const rows: CompanyDirectorRow[] = [];
    const seenCompanyNumbers = new Set<string>();

    for (let i = 0; i < activeDirectorAppointments.length; i++) {
      const appointment = activeDirectorAppointments[i];
      updateProgress(sessionId, "directors", i + 1, activeDirectorAppointments.length);
      const companyNumber = appointment.appointed_to?.company_number;
      if (!companyNumber || seenCompanyNumbers.has(companyNumber)) continue;
      seenCompanyNumbers.add(companyNumber);

      const profile = await ch.getCompanyProfile(companyNumber);
      await ch.sleep(delayMs);

      const companyName = profile?.company_name ?? appointment.appointed_to?.company_name ?? "";
      const incorporationDate = profile?.date_of_creation ?? "";
      const sicCodes = (profile?.sic_codes ?? []).join("; ");
      const regAddress = ch.formatAddress(profile?.registered_office_address);
      const locality = profile?.registered_office_address?.locality;

      rows.push({
        company_number: companyNumber,
        company_name: companyName,
        incorporation_date: incorporationDate,
        sic_codes: sicCodes,
        registered_address: regAddress,
        director_name: input,
        director_dob_month_year: "",
        director_nationality: "",
        director_occupation: "",
        director_address: "",
        company_house_url: `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`,
        ...buildDerivedRowFields({
          company_name: companyName,
          director_name: input,
          address_locality: locality,
        }),
      });
    }

    rows.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
    progressStore.delete(sessionId);

    return {
      success: true,
      rows,
      totalResults: rows.length,
      message: rows.length === 0 ? "No active director appointments found for this exact name." : undefined,
    };
  } catch (err: unknown) {
    progressStore.delete(sessionId);
    const message = err instanceof Error ? err.message : "Director search failed.";
    return { success: false, error: message };
  }
}
