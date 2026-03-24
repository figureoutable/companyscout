/**
 * Parse company numbers from a dropped .csv or .txt file.
 * - CSV: uses a known header column (case-insensitive) or first column if none match.
 * - Plain text: one number per line (ignores empty lines and # comments).
 */
const COMPANY_NUMBER_HEADERS = new Set([
  "company_number",
  "company number",
  "companynumber",
  "crn",
  "company no",
  "company no.",
]);

function normalizeLineNumber(raw: string): string | null {
  const s = raw.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "").toUpperCase();
  if (!s || s.startsWith("#")) return null;
  return s;
}

export function parseCompanyNumbersFromText(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0];
  const isLikelyCsv = first.includes(",");

  if (isLikelyCsv) {
    const headerCells = first.split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
    let colIndex = headerCells.findIndex((h) => COMPANY_NUMBER_HEADERS.has(h));
    const hasHeader = colIndex >= 0;
    if (!hasHeader) colIndex = 0;

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of dataLines) {
      const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const cell = cells[colIndex];
      const n = normalizeLineNumber(cell ?? "");
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const n = normalizeLineNumber(line);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
