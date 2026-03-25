import type { CompanyDirectorRow } from "@/types";

/**
 * Companies House officer names are usually "SURNAME, Forename Other".
 * Convert to "Forename Other SURNAME".
 */
export function formatDirectorNameFirstFirst(chName: string): string {
  const t = chName.trim();
  if (!t) return "";
  const comma = t.indexOf(",");
  if (comma === -1) return t;
  const last = t.slice(0, comma).trim();
  const rest = t.slice(comma + 1).trim();
  if (!last) return rest;
  if (!rest) return last;
  return `${rest} ${last}`.replace(/\s+/g, " ").trim();
}

/**
 * From a "forename-first" director string (e.g. "Alexander Gerald FLANAGAN-WRIGHT"),
 * keep only first and last tokens for short LinkedIn-style phrases.
 */
function formatDirectorFirstLastOnly(forenameFirst: string): string {
  const t = forenameFirst.trim();
  if (!t) return "";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Strip trailing Limited / Ltd / Ltd. (case-insensitive). */
export function cleanCompanyName(name: string): string {
  let s = name.trim();
  if (!s) return "";
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/\s+Limited\.?$/i, "")
      .replace(/\s+Ltd\.?$/i, "")
      .trim();
  }
  return s;
}

export type DerivedRowFields = Pick<
  CompanyDirectorRow,
  | "director_name_first_first"
  | "company_name_clean"
  | "company_name_clean_with_city"
  | "director_and_company_clean"
  | "director_company_linkedin"
>;

/** City/town from registered office `locality` when available. */
export function buildDerivedRowFields(params: {
  company_name: string;
  director_name: string;
  address_locality?: string;
}): DerivedRowFields {
  const clean = cleanCompanyName(params.company_name);
  const city = (params.address_locality ?? "").trim();
  const d = formatDirectorNameFirstFirst(params.director_name);

  // ASCII " - " only (no commas) — avoids CSV/Excel confusion and UTF-8 mojibake from smart punctuation.
  const company_name_clean_with_city = city ? `${clean} - ${city}` : clean;
  const director_and_company_clean = d ? `${d} - ${clean}` : clean;
  const dLinkedin = formatDirectorFirstLastOnly(d);
  const director_company_linkedin =
    dLinkedin && clean
      ? `${dLinkedin}, ${clean} linkedin`
      : dLinkedin
        ? `${dLinkedin}, linkedin`
        : clean
          ? `${clean} linkedin`
          : "";

  return {
    director_name_first_first: d,
    company_name_clean: clean,
    company_name_clean_with_city,
    director_and_company_clean,
    director_company_linkedin,
  };
}
