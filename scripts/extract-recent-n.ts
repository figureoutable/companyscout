/**
 * One-off: N most recently incorporated companies (day-by-day from today), directors, CSV.
 *
 *   npm run extract-2000
 *   EXTRACT_COUNT=500 npm run extract-recent
 *
 * Requires .env.local: COMPANIES_HOUSE_API_KEY
 * Optional: OFFICER_FETCH_DELAY_MS (default 700)
 */

import { config } from "dotenv";
import { resolve } from "path";
import { mkdir, writeFile } from "fs/promises";
import { createCompaniesHouseClient } from "../lib/companiesHouse";
import { buildCsvContent } from "../lib/csvExport";
import { buildDerivedRowFields } from "../lib/rowDerivatives";
import type { CHCompanySearchItem, CompanyDirectorRow } from "../types";

config({ path: resolve(process.cwd(), ".env.local") });

const COUNT = Math.min(5000, Math.max(1, Number(process.env.EXTRACT_COUNT) || 2000));
const OFFICER_DELAY_MS = Number(process.env.OFFICER_FETCH_DELAY_MS) || 700;
const MAX_DAY_SCAN = 1095;

async function main() {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) throw new Error("COMPANIES_HOUSE_API_KEY missing in .env.local");

  const ch = createCompaniesHouseClient(apiKey, OFFICER_DELAY_MS);
  const itemsPerPage = ch.ITEMS_PER_PAGE;

  console.log(`[extract] Collecting ${COUNT} most recent companies (max ${MAX_DAY_SCAN} days back)...`);

  const collected: CHCompanySearchItem[] = [];
  const seen = new Set<string>();
  const day = new Date();
  day.setHours(0, 0, 0, 0);

  for (let dayIndex = 0; dayIndex < MAX_DAY_SCAN && collected.length < COUNT; dayIndex++) {
    const ymd = day.toISOString().slice(0, 10);
    if (dayIndex % 30 === 0) console.log(`[extract] Day ${dayIndex + 1} scanning ${ymd}… (${collected.length}/${COUNT})`);

    let startIndex = 0;
    let firstCompanyNumberOfPrevPage: string | null = null;

    while (collected.length < COUNT) {
      let res;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          res = await ch.advancedSearch({
            incorporated_from: ymd,
            incorporated_to: ymd,
            start_index: startIndex,
            items_per_page: Math.min(itemsPerPage, 25),
          });
          break;
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 500 && attempt < 4) {
            const wait = 3000 * (attempt + 1);
            console.warn(`[extract] API 500 at ${ymd} start_index=${startIndex}, retry in ${wait}ms…`);
            await new Promise((r) => setTimeout(r, wait));
          } else {
            console.warn(`[extract] Stopping ${ymd} pagination at start_index=${startIndex} (${status ?? e})`);
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
        if (collected.length >= COUNT) break;
      }

      startIndex += items.length;
      const totalOnDay = res.total_results ?? 0;
      if (totalOnDay > 0 && startIndex >= totalOnDay) break;
    }

    day.setDate(day.getDate() - 1);
  }

  const top = collected.slice(0, COUNT);
  if (top.length < COUNT) {
    console.warn(`[extract] Only found ${top.length} companies in ${MAX_DAY_SCAN} days.`);
  }

  console.log(`[extract] Fetching officers for ${top.length} companies…`);

  const allRows: CompanyDirectorRow[] = [];
  for (let i = 0; i < top.length; i++) {
    const company = top[i];
    if ((i + 1) % 100 === 0 || i === 0) console.log(`[extract] Officers ${i + 1}/${top.length}`);

    const officersRes = await ch.getOfficers(company.company_number);
    await ch.sleep(OFFICER_DELAY_MS);

    const directors = (officersRes?.items ?? []).filter(
      (o) => o.officer_role?.toLowerCase() === "director"
    );
    const regAddress = ch.formatAddress(company.registered_office_address);
    const sicStr = (company.sic_codes ?? []).join("; ");
    const incorporationDate = company.date_of_creation ?? "";
    const url = `https://find-and-update.company-information.service.gov.uk/company/${company.company_number}`;
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
        company_house_url: url,
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
          company_house_url: url,
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
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `extract_recent_${COUNT}_${stamp}.csv`;
  const csv = buildCsvContent(allRows);

  await mkdir(resolve(process.cwd(), "exports"), { recursive: true });
  const localPath = resolve(process.cwd(), "exports", filename);
  await writeFile(localPath, csv, "utf-8");
  console.log(`[extract] Done. ${allRows.length} rows → ${localPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
