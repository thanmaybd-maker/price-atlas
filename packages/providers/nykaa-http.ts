import { Agent, fetch as fetchWithDispatcher } from 'undici';

// Some Nykaa responses exceed Node fetch's default 16 KiB header allowance.
const dispatcher = new Agent({
  maxHeaderSize: 65536,
  maxResponseSize: 4 * 1024 * 1024,
  connections: 2,
  allowH2: false,
});
export const nykaaFetch: typeof fetch = async (input, options) => {
  const url = new URL(String(input));
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.nykaa.com' ||
    url.username ||
    url.password ||
    url.port ||
    (options?.method && options.method !== 'GET')
  )
    throw new Error('Unsupported Nykaa request');
  const init = {
    method: 'GET',
    headers: Object.fromEntries(new Headers(options?.headers).entries()),
    signal: options?.signal,
    dispatcher,
    redirect: 'manual' as const,
  };
  return (await fetchWithDispatcher(url, init)) as unknown as Response;
};
