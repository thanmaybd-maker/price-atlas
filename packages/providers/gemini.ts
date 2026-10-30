// Optional Gemini search assist: corrects spelling and states intent for a shopper's query.
//
// The model never supplies prices, products or facts. It may only rewrite the words a
// shopper typed. Every model number, size, storage figure, ISBN or other token containing
// a digit must survive the rewrite unchanged, otherwise the suggestion is discarded and
// the ordinary search runs on the original text. Without GEMINI_API_KEY this module
// reports "unavailable" and search behaves exactly as before.
import { categoryLabels } from '../domain/categories';

export type AssistResult = {
  provider: 'gemini';
  available: boolean;
  original: string;
  /** Present only when Gemini proposed a different, validated query. */
  refined?: string;
  category?: keyof typeof categoryLabels;
  /** Why no refinement is offered, when none is. */
  reason?:
    'unconfigured' | 'unchanged' | 'rejected' | 'timeout' | 'error' | 'limited' | 'not_applicable';
  cached?: boolean;
  /** Upstream status and message when Gemini refused the request. Never contains the key. */
  detail?: string;
};

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const TIMEOUT_MS = 6000;
const MAX_QUERY = 120;
const CACHE_TTL = 24 * 3600000;
const CACHE_MAX = 500;
const DAILY_CAP = () => Math.max(1, Number(process.env.GEMINI_DAILY_LIMIT) || 400);

const cache = new Map<string, { at: number; value: AssistResult }>();
let day = '';
let used = 0;

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

const fold = (s: string) => s.toLowerCase().replace(/[\s\-_./]+/g, '');
const words = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** Tokens that identify an exact variant. They must appear, unchanged, in any rewrite. */
export function protectedTokens(query: string) {
  return words(query)
    .split(' ')
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}″"]+$/gu, ''))
    .filter((t) => /\d/.test(t));
}

/** Validate a model rewrite against the original. Returns the cleaned rewrite or null. */
export function acceptRewrite(original: string, proposal: unknown): string | null {
  if (typeof proposal !== 'string') return null;
  const next = words(proposal).replace(/^["'“”]+|["'“”]+$/g, '');
  if (next.length < 2 || next.length > MAX_QUERY) return null;
  if (/https?:\/\/|[<>{}]/i.test(next)) return null;
  const haystack = fold(next);
  for (const token of protectedTokens(original)) if (!haystack.includes(fold(token))) return null;
  // The rewrite must carry exactly the same numbers: adding one ("xm5" -> "WH-1000XM5")
  // or dropping one would point at a different variant.
  const digits = (s: string) => (s.match(/\d+/g) || []).sort().join(',');
  if (digits(next) !== digits(original)) return null;
  return fold(next) === fold(original) ? null : next;
}

function prompt(query: string) {
  const categories = Object.keys(categoryLabels).join(', ');
  return [
    'You fix shopping search queries for an Indian price-comparison site.',
    'Correct spelling, brand capitalisation and obvious word order. Expand common shorthand',
    '(e.g. "iph" -> "iPhone", "sammy" -> "Samsung"). Keep it a short search query, not a sentence.',
    'Never change, add or remove any number, model code, storage, size, pack count or ISBN.',
    'Do not add words the shopper did not imply. If the query is already fine, return it unchanged.',
    `Pick the best category from: ${categories}. Use "other" if unsure.`,
    `Query: ${JSON.stringify(query)}`,
  ].join('\n');
}

type Fetch = typeof fetch;

async function callGemini(query: string, f: Fetch, withThinkingOff: boolean) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt(query) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING' },
          category: { type: 'STRING', enum: Object.keys(categoryLabels) },
        },
        required: ['query', 'category'],
      },
      ...(withThinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  const res = await f(ENDPOINT(MODEL()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY as string,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, text: text.slice(0, 300) };
  return { ok: true as const, json: JSON.parse(text) };
}

/** Ask Gemini for a corrected query. Never throws; every failure falls back to the original. */
export async function assistQuery(raw: string, f: Fetch = fetch): Promise<AssistResult> {
  const original = words(raw).slice(0, 2000);
  const base: AssistResult = { provider: 'gemini', available: geminiConfigured(), original };
  if (!base.available) return { ...base, reason: 'unconfigured' };
  if (original.length < 2 || original.length > MAX_QUERY || /^https?:\/\//i.test(original))
    return { ...base, reason: 'not_applicable' };
  const key = original.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.value, cached: true };
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    used = 0;
  }
  if (used >= DAILY_CAP()) return { ...base, reason: 'limited' };
  used++;
  let value: AssistResult;
  try {
    let out = await callGemini(original, f, true);
    // Some model versions reject a thinking budget; retry once without it.
    if (!out.ok && out.status === 400 && /thinking/i.test(out.text))
      out = await callGemini(original, f, false);
    if (!out.ok) {
      // Google's error text never contains the key; keep only its status and message.
      let message = '';
      try {
        message = String(JSON.parse(out.text)?.error?.message || '');
      } catch {
        message = out.text;
      }
      value = { ...base, reason: 'error', detail: `HTTP ${out.status}: ${message.slice(0, 160)}` };
    } else {
      const part = out.json?.candidates?.[0]?.content?.parts?.find(
        (p: { text?: string }) => typeof p.text === 'string',
      )?.text;
      let parsed: { query?: unknown; category?: unknown } = {};
      try {
        parsed = JSON.parse(part || '{}');
      } catch {
        parsed = {};
      }
      const category =
        typeof parsed.category === 'string' && parsed.category in categoryLabels
          ? (parsed.category as keyof typeof categoryLabels)
          : undefined;
      const refined = acceptRewrite(original, parsed.query);
      value = refined
        ? { ...base, refined, category }
        : {
            ...base,
            category,
            reason:
              typeof parsed.query === 'string' && fold(words(parsed.query)) === fold(original)
                ? 'unchanged'
                : 'rejected',
          };
    }
  } catch (error) {
    const name = (error as Error)?.name;
    value = {
      ...base,
      reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error',
    };
  }
  if (value.reason !== 'timeout' && value.reason !== 'error') {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}

export function resetGeminiForTests() {
  cache.clear();
  day = '';
  used = 0;
}
