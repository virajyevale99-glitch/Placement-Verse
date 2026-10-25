/** Same rule as normalizeCompanyName_ in Code.gs, so CSV imports match existing companies. */
export function normalizeCompanyName(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company|plc|gmbh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
