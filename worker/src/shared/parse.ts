// Defensive coercion helpers for reading values out of untyped JSON payloads.

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') out[key] = val;
  }
  return out;
}

// Coerce an unknown to a number, passing through actual numbers and parsing the rest.
export function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}
