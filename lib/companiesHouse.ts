import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  CHAddress,
  CHAdvancedSearchResponse,
  CHOfficerAppointmentsResponse,
  CHOfficerAppointmentItem,
  CHCompanySearchItem,
  CHCompanyProfile,
  CHOfficerItem,
  CHOfficerSearchItem,
  CHOfficerSearchResponse,
  CHOfficersResponse,
} from "@/types";

const BASE_URL = "https://api.company-information.service.gov.uk";
// API often returns ~25 per page regardless; we paginate until we have total_results
const ITEMS_PER_PAGE = 100;
const DEFAULT_OFFICER_DELAY_MS = 200;
const MAX_429_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

function formatAddress(addr: { address_line_1?: string; address_line_2?: string; locality?: string; region?: string; postal_code?: string; country?: string } | undefined): string {
  if (!addr) return "";
  const parts = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse accounts overdue / next due from GET /company/{number} JSON. */
function parseAccountsFromProfile(d: Record<string, unknown>): {
  overdue: boolean | null;
  next_due_on: string;
} {
  const accounts = d.accounts ?? d.Accounts;
  if (!accounts || typeof accounts !== "object") {
    return { overdue: null, next_due_on: "" };
  }
  const a = accounts as Record<string, unknown>;
  const nextAccounts = a.next_accounts ?? a.nextAccounts;
  if (nextAccounts && typeof nextAccounts === "object") {
    const na = nextAccounts as Record<string, unknown>;
    const dueRaw = na.due_on ?? na.dueOn;
    const due = typeof dueRaw === "string" ? dueRaw : "";
    const ov = na.overdue ?? na.Overdue;
    if (typeof ov === "boolean") {
      return { overdue: ov, next_due_on: due };
    }
  }
  const top = a.overdue ?? a.Overdue;
  if (typeof top === "boolean") {
    const nextDue = a.next_due ?? a.nextDue;
    const dueStr = typeof nextDue === "string" ? nextDue : "";
    return { overdue: top, next_due_on: dueStr };
  }
  return { overdue: null, next_due_on: "" };
}

/** Parse confirmation statement overdue / next due from GET /company/{number} JSON. */
function parseConfirmationStatementFromProfile(d: Record<string, unknown>): {
  overdue: boolean | null;
  next_due_on: string;
} {
  const cs = d.confirmation_statement ?? d.confirmationStatement;
  if (!cs || typeof cs !== "object") {
    return { overdue: null, next_due_on: "" };
  }
  const c = cs as Record<string, unknown>;
  const ov = c.overdue ?? c.Overdue;
  const nextDue = c.next_due ?? c.nextDue;
  const dueStr = typeof nextDue === "string" ? nextDue : "";
  if (typeof ov === "boolean") {
    return { overdue: ov, next_due_on: dueStr };
  }
  if (dueStr) {
    return { overdue: null, next_due_on: dueStr };
  }
  return { overdue: null, next_due_on: "" };
}

export function createCompaniesHouseClient(apiKey: string, officerDelayMs: number = DEFAULT_OFFICER_DELAY_MS) {
  const client: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    auth: {
      username: apiKey,
      password: "",
    },
    headers: {
      Accept: "application/json",
    },
  });

  async function requestWithBackoff<T>(fn: () => Promise<T>, retries = MAX_429_RETRIES): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 429 && retries > 0) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, MAX_429_RETRIES - retries);
        await sleep(backoff);
        return requestWithBackoff(fn, retries - 1);
      }
      throw err;
    }
  }

  async function advancedSearch(params: {
    incorporated_from: string;
    incorporated_to: string;
    sic_codes?: string;
    company_type?: string;
    location?: string;
    start_index?: number;
    items_per_page?: number;
  }): Promise<CHAdvancedSearchResponse> {
    const { data } = await requestWithBackoff(() =>
      client.get<Record<string, unknown>>("/advanced-search/companies", { params })
    );
    // API may return snake_case or camelCase; normalize to our expected shape
    const rawItems = (data.items ?? data.Items ?? []) as Record<string, unknown>[];
    const items: CHCompanySearchItem[] = rawItems.map((c) => ({
      company_number: (c.company_number ?? c.companyNumber) as string,
      company_name: (c.company_name ?? c.companyName) as string,
      company_status: (c.company_status ?? c.companyStatus) as string,
      company_type: (c.company_type ?? c.companyType) as string,
      date_of_creation: (c.date_of_creation ?? c.dateOfCreation) as string | undefined,
      sic_codes: (c.sic_codes ?? c.sicCodes) as string[] | undefined,
      registered_office_address: (c.registered_office_address ?? c.registeredOfficeAddress) as CHAddress | undefined,
    }));
    const totalResults = Number(data.total_results ?? data.totalResults ?? 0);
    const pageNumber = Number(data.page_number ?? data.pageNumber ?? 0);
    const itemsPerPage = Number(data.items_per_page ?? data.itemsPerPage ?? 0);
    return {
      items,
      total_results: totalResults,
      page_number: pageNumber,
      items_per_page: itemsPerPage,
    };
  }

  async function getCompanyProfile(companyNumber: string): Promise<CHCompanyProfile | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { data } = await requestWithBackoff(() =>
          client.get<Record<string, unknown>>(`/company/${encodeURIComponent(companyNumber)}`)
        );
        const d = data;
        const { overdue, next_due_on } = parseAccountsFromProfile(d);
        const confirm = parseConfirmationStatementFromProfile(d);
        return {
          company_number: (d.company_number ?? d.companyNumber ?? companyNumber) as string,
          company_name: (d.company_name ?? d.companyName ?? "") as string,
          company_status: (d.company_status ?? d.companyStatus) as string | undefined,
          date_of_creation: (d.date_of_creation ?? d.dateOfCreation) as string | undefined,
          sic_codes: (d.sic_codes ?? d.sicCodes) as string[] | undefined,
          registered_office_address: (d.registered_office_address ?? d.registeredOfficeAddress) as
            | CHAddress
            | undefined,
          accounts_overdue: overdue,
          accounts_next_due_on: next_due_on || undefined,
          confirmation_statement_overdue: confirm.overdue,
          confirmation_statement_next_due_on: confirm.next_due_on || undefined,
        };
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        if (status === 404) return null;
        if ((status === 500 || status === 502) && attempt < 3) {
          const wait = 2500 * (attempt + 1);
          console.warn(`[CH] profile ${companyNumber} ${status}, retry in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        console.error(`Company profile fetch failed for ${companyNumber}:`, (err as Error).message);
        return null;
      }
    }
    return null;
  }

  async function getOfficers(companyNumber: string): Promise<CHOfficersResponse | null> {
    try {
      // One main attempt; if we get a 429, wait briefly and retry once.
      const fetchOnce = async () => {
        return client.get<Record<string, unknown>>(
          `/company/${encodeURIComponent(companyNumber)}/officers`,
          {
            params: { items_per_page: 100 },
          }
        );
      };

      let resp;
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          resp = await fetchOnce();
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          const status = (err as AxiosError)?.response?.status;
          if (status === 429 || status === 500 || status === 502) {
            const wait = status === 429 ? 2000 : 3000 * (attempt + 1);
            if (attempt < 3) {
              console.warn(`[CH] officers ${companyNumber} ${status}, retry in ${wait}ms`);
              await sleep(wait);
              continue;
            }
          }
          break;
        }
      }
      if (!resp) {
        console.error(`Officer fetch failed for company ${companyNumber}:`, (lastErr as Error)?.message);
        return null;
      }

      const data = resp!.data as Record<string, unknown>;
      const rawItems = (data.items ?? data.Items ?? []) as Record<string, unknown>[];
      const items: CHOfficerItem[] = rawItems.map((o) => {
        const dob = (o.date_of_birth ?? o.dateOfBirth) as { month?: number; year?: number } | undefined;
        return {
          name: (o.name ?? "") as string,
          officer_role: (o.officer_role ?? o.officerRole ?? "") as string,
          appointed_on: (o.appointed_on ?? o.appointedOn) as string | undefined,
          resigned_on: (o.resigned_on ?? o.resignedOn) as string | undefined,
          date_of_birth: dob,
          nationality: (o.nationality ?? "") as string | undefined,
          occupation: (o.occupation ?? "") as string | undefined,
          address: (o.address ?? o.registered_address ?? o.registeredAddress) as CHAddress | undefined,
        };
      });
      const totalResults = Number(
        (data as { total_results?: number; totalResults?: number }).total_results ??
          (data as { total_results?: number; totalResults?: number }).totalResults ??
          0
      );
      return { items, total_results: totalResults };
    } catch (err) {
      console.error(`Officer fetch failed for company ${companyNumber}:`, (err as Error).message);
      return null;
    }
  }

  async function searchOfficersByName(query: string): Promise<CHOfficerSearchResponse | null> {
    try {
      const { data } = await requestWithBackoff(() =>
        client.get<Record<string, unknown>>("/search/officers", {
          params: {
            q: query,
            items_per_page: 100,
          },
        })
      );
      const rawItems = (data.items ?? data.Items ?? []) as Record<string, unknown>[];
      const items: CHOfficerSearchItem[] = rawItems.map((item) => ({
        title: (item.title ?? item.name ?? "") as string,
        name: (item.name ?? item.title ?? "") as string | undefined,
        kind: item.kind as string | undefined,
        officer_role: (item.officer_role ?? item.officerRole) as string | undefined,
        date_of_birth: (item.date_of_birth ?? item.dateOfBirth) as
          | { month?: number; year?: number }
          | undefined,
        links: item.links as CHOfficerSearchItem["links"],
      }));
      const totalResults = Number(data.total_results ?? data.totalResults ?? 0);
      return { items, total_results: totalResults };
    } catch (err) {
      console.error(`Officer search failed for "${query}":`, (err as Error).message);
      return null;
    }
  }

  async function getOfficerAppointments(appointmentsPath: string): Promise<CHOfficerAppointmentsResponse | null> {
    try {
      const { data } = await requestWithBackoff(() =>
        client.get<Record<string, unknown>>(appointmentsPath, {
          params: { items_per_page: 100 },
        })
      );
      const rawItems = (data.items ?? data.Items ?? []) as Record<string, unknown>[];
      const items: CHOfficerAppointmentItem[] = rawItems.map((item) => ({
        name: item.name as string | undefined,
        officer_role: (item.officer_role ?? item.officerRole) as string | undefined,
        appointed_on: (item.appointed_on ?? item.appointedOn) as string | undefined,
        resigned_on: (item.resigned_on ?? item.resignedOn) as string | undefined,
        appointed_to: (item.appointed_to ?? item.appointedTo) as CHOfficerAppointmentItem["appointed_to"],
      }));
      const totalResults = Number(data.total_results ?? data.totalResults ?? 0);
      return { items, total_results: totalResults };
    } catch (err) {
      console.error(`Officer appointments fetch failed (${appointmentsPath}):`, (err as Error).message);
      return null;
    }
  }

  return {
    client,
    advancedSearch,
    getCompanyProfile,
    getOfficers,
    searchOfficersByName,
    getOfficerAppointments,
    formatAddress,
    ITEMS_PER_PAGE,
    officerDelayMs,
    sleep,
  };
}

export type CompaniesHouseClient = ReturnType<typeof createCompaniesHouseClient>;
