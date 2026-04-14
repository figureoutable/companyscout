"use server";

import { createCompaniesHouseClient } from "@/lib/companiesHouse";
import { buildDerivedRowFields } from "@/lib/rowDerivatives";
import type { CHCompanyProfile, CompanyDirectorRow } from "@/types";

function enrichmentComplianceFieldsFromProfile(p: CHCompanyProfile): Pick<
  CompanyDirectorRow,
  "accounts_overdue" | "accounts_next_due_on" | "confirmation_overdue" | "confirmation_next_due_on"
> {
  const ao = p.accounts_overdue;
  const adue = p.accounts_next_due_on ?? "";
  const accountsLabel = ao === true ? "Yes" : ao === false ? "No" : "Unknown";

  const co = p.confirmation_statement_overdue;
  const cdue = p.confirmation_statement_next_due_on ?? "";
  const confirmLabel = co === true ? "Yes" : co === false ? "No" : "Unknown";

  return {
    accounts_overdue: accountsLabel,
    accounts_next_due_on: adue,
    confirmation_overdue: confirmLabel,
    confirmation_next_due_on: cdue,
  };
}

const enrichProgressStore = new Map<string, { current: number; total: number }>();

const DEFAULT_MAX_ENRICH = 500;

export async function getEnrichProgress(sessionId: string): Promise<{
  current: number;
  total: number;
} | null> {
  return enrichProgressStore.get(sessionId) ?? null;
}

function sanitizeCompanyNumber(raw: string): string | null {
  const s = raw.replace(/[\s"']/g, "").toUpperCase();
  if (!s || s.length > 20) return null;
  if (!/^[A-Z0-9]{6,10}$/.test(s)) return null;
  return s;
}

/**
 * For each company number: profile + officers → same row shape as search (one row per director).
 * Per-company failures are skipped; always returns partial results when possible.
 */
export async function enrichCompanyNumbers(
  companyNumbers: string[],
  sessionId: string
): Promise<
  | { success: true; rows: CompanyDirectorRow[]; message?: string }
  | { success: false; error: string }
> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    return { success: false, error: "COMPANIES_HOUSE_API_KEY is not set." };
  }

  const max = Math.min(
    2000,
    Math.max(1, Number(process.env.ENRICH_MAX_COMPANIES) || DEFAULT_MAX_ENRICH)
  );
  const rawUnique = Array.from(new Set(companyNumbers.map((n) => n.trim()).filter(Boolean)));
  const unique = rawUnique.map((n) => sanitizeCompanyNumber(n)).filter((n): n is string => Boolean(n));
  const skippedInvalid = rawUnique.length - unique.length;

  if (unique.length === 0) {
    return {
      success: false,
      error:
        skippedInvalid > 0
          ? "No valid UK company numbers found. Use 6–10 letters/digits (e.g. 12345678 or SC123456)."
          : "No company numbers found in the file.",
    };
  }

  const toProcess = unique.slice(0, max);
  const truncated = unique.length > max;

  // Default delay tuned for typical serverless limits; keep configurable via OFFICER_FETCH_DELAY_MS.
  const delayMs = Number(process.env.OFFICER_FETCH_DELAY_MS) || 150;
  const ch = createCompaniesHouseClient(apiKey, delayMs);
  const allRows: CompanyDirectorRow[] = [];
  const failed: string[] = [];
  let fatalMessage: string | undefined;

  try {
    enrichProgressStore.set(sessionId, { current: 0, total: toProcess.length });

    for (let i = 0; i < toProcess.length; i++) {
      const num = toProcess[i];
      enrichProgressStore.set(sessionId, { current: i + 1, total: toProcess.length });

      try {
        const profile = await ch.getCompanyProfile(num);
        if (!profile) {
          failed.push(num);
          await ch.sleep(delayMs);
          continue;
        }

        const officersRes = await ch.getOfficers(num);
        await ch.sleep(delayMs);

        const regAddress = ch.formatAddress(profile.registered_office_address);
        const sicStr = (profile.sic_codes ?? []).join("; ");
        const incorporationDate = profile.date_of_creation ?? "";
        const url = `https://find-and-update.company-information.service.gov.uk/company/${profile.company_number}`;

        const directors = (officersRes?.items ?? []).filter(
          (o) => o.officer_role?.toLowerCase() === "director"
        );

        const compliance = enrichmentComplianceFieldsFromProfile(profile);
        const locality = profile.registered_office_address?.locality;

        if (directors.length === 0) {
          allRows.push({
            company_number: profile.company_number,
            company_name: profile.company_name ?? "",
            company_status: profile.company_status ?? "",
            incorporation_date: incorporationDate,
            sic_codes: sicStr,
            registered_address: regAddress,
            director_name: "",
            director_dob_month_year: "",
            director_nationality: "",
            director_occupation: "",
            director_address: "",
            company_house_url: url,
            ...compliance,
            ...buildDerivedRowFields({
              company_name: profile.company_name ?? "",
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
              company_number: profile.company_number,
              company_name: profile.company_name ?? "",
              company_status: profile.company_status ?? "",
              incorporation_date: incorporationDate,
              sic_codes: sicStr,
              registered_address: regAddress,
              director_name: d.name ?? "",
              director_dob_month_year: dob,
              director_nationality: d.nationality ?? "",
              director_occupation: d.occupation ?? "",
              director_address: ch.formatAddress(d.address),
              company_house_url: url,
              ...compliance,
              ...buildDerivedRowFields({
                company_name: profile.company_name ?? "",
                director_name: d.name ?? "",
                address_locality: locality,
              }),
            });
          }
        }
      } catch (perCompanyErr: unknown) {
        const msg = perCompanyErr instanceof Error ? perCompanyErr.message : String(perCompanyErr);
        console.error(`[enrich] Skipped ${num}:`, msg);
        failed.push(num);
        try {
          await ch.sleep(delayMs);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (outer: unknown) {
    fatalMessage = outer instanceof Error ? outer.message : "Enrichment interrupted.";
    console.error("[enrich] Outer error:", outer);
  } finally {
    enrichProgressStore.delete(sessionId);
  }

  const parts: string[] = [];
  if (truncated) {
    parts.push(
      `Processed first ${max} of ${unique.length} valid numbers. Set ENRICH_MAX_COMPANIES to raise the cap (max 2000).`
    );
  }
  if (skippedInvalid > 0) {
    parts.push(`${skippedInvalid} line(s) skipped (invalid company number format).`);
  }
  if (failed.length > 0) {
    const f = failed.slice(0, 10).join(", ");
    const more = failed.length > 10 ? ` (+${failed.length - 10} more)` : "";
    parts.push(`Could not load or process: ${f}${more}.`);
  }
  if (fatalMessage) {
    parts.push(`Run ended early: ${fatalMessage} Showing ${allRows.length} row(s) collected so far.`);
  }

  const message = parts.length > 0 ? parts.join(" ") : undefined;

  if (allRows.length === 0) {
    return {
      success: true,
      rows: [],
      message:
        message ??
        "No rows could be built. Check company numbers exist at Companies House and your API key.",
    };
  }

  return { success: true, rows: allRows, message };
}
