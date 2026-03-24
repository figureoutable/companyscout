// Companies House API response types

export interface CHAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

export interface CHCompanySearchItem {
  company_number: string;
  company_name: string;
  company_status: string;
  company_type: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: CHAddress;
}

export interface CHAdvancedSearchResponse {
  page_number: number;
  total_results: number;
  items_per_page: number;
  items: CHCompanySearchItem[];
}

export interface CHOfficerItem {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  date_of_birth?: {
    month?: number;
    year?: number;
  };
  nationality?: string;
  occupation?: string;
  address?: CHAddress;
}

export interface CHOfficersResponse {
  total_results: number;
  items: CHOfficerItem[];
}

/** GET /company/{number} profile (subset we use for enrichment). */
export interface CHCompanyProfile {
  company_number: string;
  company_name: string;
  company_status?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: CHAddress;
  /** From accounts.next_accounts.overdue (or legacy accounts.overdue). */
  accounts_overdue?: boolean | null;
  /** From accounts.next_accounts.due_on (YYYY-MM-DD). */
  accounts_next_due_on?: string;
  /** From confirmation_statement.overdue. */
  confirmation_statement_overdue?: boolean | null;
  /** From confirmation_statement.next_due (YYYY-MM-DD). */
  confirmation_statement_next_due_on?: string;
}

// Flattened row for UI and CSV: one row per company-director pair
export interface CompanyDirectorRow {
  company_number: string;
  company_name: string;
  incorporation_date: string;
  sic_codes: string;
  registered_address: string;
  director_name: string;
  director_dob_month_year: string;
  director_nationality: string;
  director_occupation: string;
  director_address: string;
  company_house_url: string;
  /** Enrichment: "Yes" | "No" | "Unknown" from Companies House accounts. */
  accounts_overdue?: string;
  /** Enrichment: next accounts due date (YYYY-MM-DD) when provided. */
  accounts_next_due_on?: string;
  /** Enrichment: confirmation statement overdue Yes/No/Unknown. */
  confirmation_overdue?: string;
  /** Enrichment: confirmation statement next due (YYYY-MM-DD). */
  confirmation_next_due_on?: string;
  /** Director name with forename(s) first, e.g. "Brian George WILLIAMSON". */
  director_name_first_first?: string;
  /** Company name without Ltd / Limited / Ltd. */
  company_name_clean?: string;
  /** Clean company name + registered office locality (town/city). */
  company_name_clean_with_city?: string;
  /** Clean company name + director (first name first). */
  company_clean_and_director?: string;
  /** Director (first name first) + clean company name. */
  director_and_company_clean?: string;
}

// Search filters (form state)
export interface SearchFilters {
  /** How many most recently incorporated companies to load (then officers). */
  recentResultCount: number;
  sicCodes: string[];
  companyType: string;
  addressKeyword: string;
}

export const COMPANY_TYPES = [
  { value: "", label: "Any" },
  { value: "ltd", label: "Private limited company (ltd)" },
  { value: "plc", label: "Public limited company (plc)" },
  { value: "llp", label: "Limited liability partnership (llp)" },
  { value: "private-limited-guarant-nsc-limited-exemption", label: "Private limited (guarant nsc)" },
  { value: "private-unlimited", label: "Private unlimited" },
  { value: "limited-partnership", label: "Limited partnership" },
  { value: "oversea-entity", label: "Overseas entity" },
] as const;
