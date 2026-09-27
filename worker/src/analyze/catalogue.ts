export interface CatalogueModel {
  id: string;
  inUsdPerM: number;
  outUsdPerM: number;
}

const PRICING_URL = 'https://developers.cloudflare.com/workers-ai/platform/pricing/index.md';
// Input and output prices share one cell, separated by whitespace or (page
// format since 2026-09) an HTML `<br>`.
const ROW = /\|\s*(@cf\/[^\s|]+)\s*\|\s*\$([\d.]+) per M input tokens(?:\s|<br\s*\/?>)+\$([\d.]+) per M output tokens/g;

export function parsePricingCatalogue(markdown: string): CatalogueModel[] {
  const out: CatalogueModel[] = [];
  for (const m of markdown.matchAll(ROW)) {
    out.push({ id: m[1], inUsdPerM: Number(m[2]), outUsdPerM: Number(m[3]) });
  }
  return out.sort((a, b) => a.outUsdPerM - b.outUsdPerM || a.inUsdPerM - b.inUsdPerM);
}

export async function fetchPricingCatalogue(fetchImpl: typeof fetch): Promise<CatalogueModel[]> {
  const res = await fetchImpl(PRICING_URL, { headers: { 'User-Agent': 'DikDuk/1.0' } });
  if (!res.ok) throw new Error(`pricing fetch failed: ${res.status}`);
  return parsePricingCatalogue(await res.text());
}
