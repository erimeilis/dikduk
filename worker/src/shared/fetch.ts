// Shared HTTP helpers that turn fetch + response-status + body-read into a typed
// result, with consistent failure logging across all external calls.

export type FetchFailureCode = 'UPSTREAM' | 'PARSE';

export interface FetchError<C extends FetchFailureCode = FetchFailureCode> {
  error: string;
  code: C;
}

export type FetchResult<T> = { ok: true; value: T } | { ok: false; failure: FetchError };

// Caller-supplied error-message builders so each call site keeps its exact,
// wire-visible error strings.
export interface FetchMessages {
  // label used in the log line, e.g. 'lookup', 'analyze', 'gemini'
  logLabel: string;
  // builds the message for a thrown request error (network failure)
  requestFailed: (message: string) => string;
  // builds the message for a non-2xx response
  badStatus: (status: number) => string;
}

// Run a fetch and validate the response status. Logs on failure for every caller.
export async function safeFetch(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit | undefined,
  messages: FetchMessages,
): Promise<{ ok: true; response: Response } | { ok: false; failure: FetchError<'UPSTREAM'> }> {
  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (e) {
    console.error(`[${messages.logLabel}] fetch failed:`, url, e);
    return { ok: false, failure: { error: messages.requestFailed((e as Error).message), code: 'UPSTREAM' } };
  }

  if (!response.ok) {
    console.error(`[${messages.logLabel}] upstream status ${response.status}:`, url);
    return { ok: false, failure: { error: messages.badStatus(response.status), code: 'UPSTREAM' } };
  }

  return { ok: true, response };
}

// Fetch and read the response body as text.
export async function fetchText(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit | undefined,
  messages: FetchMessages,
): Promise<FetchResult<string>> {
  const res = await safeFetch(doFetch, url, init, messages);
  if (!res.ok) return res;
  return { ok: true, value: await res.response.text() };
}
