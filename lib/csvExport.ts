import type { CompanyDirectorRow } from "@/types";

const CSV_HEADERS = [
  "company_number",
  "company_name",
  "incorporation_date",
  "sic_codes",
  "registered_address",
  "accounts_overdue",
  "accounts_next_due_on",
  "confirmation_overdue",
  "confirmation_next_due_on",
  "director_name",
  "director_name_first_first",
  "company_name_clean",
  "company_name_clean_with_city",
  "company_clean_and_director",
  "director_and_company_clean",
  "director_dob_month_year",
  "director_nationality",
  "director_occupation",
  "director_address",
] as const;

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** UTF-8 BOM so Excel on Windows opens the file as UTF-8 instead of misreading multibyte characters. */
const UTF8_BOM = "\uFEFF";

export function buildCsvContent(rows: CompanyDirectorRow[]): string {
  const headerLine = CSV_HEADERS.join(",");
  const dataLines = rows.map((row) =>
    CSV_HEADERS.map((h) => escapeCsvField(String(row[h] ?? ""))).join(",")
  );
  return UTF8_BOM + [headerLine, ...dataLines].join("\n");
}

export function getCsvFilename(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `companies_house_${today}.csv`;
}

export function downloadCsv(rows: CompanyDirectorRow[], filename?: string): void {
  const content = buildCsvContent(rows);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename ?? getCsvFilename();
  link.click();
  URL.revokeObjectURL(url);
}
