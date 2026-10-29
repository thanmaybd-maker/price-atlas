export async function fetchJson<T = any>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...(init.signal ? [init.signal] : []),
    ]),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error || body.message || `Request failed (${response.status}). Please retry.`,
    );
  return body;
}
