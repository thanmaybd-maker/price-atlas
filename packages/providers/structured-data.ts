import type { CheerioAPI } from 'cheerio';

// Some Croma pages append one extra closing brace. Repair only that exact
// syntax error; never execute scripts or guess values from malformed markup.
export function structuredData($: CheerioAPI): Record<string, any>[] {
  const records: Record<string, any>[] = [];
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) for (const item of value) visit(item, depth + 1);
    else if (typeof value === 'object') {
      records.push(value);
      if (value['@graph']) visit(value['@graph'], depth + 1);
    }
  };
  $('script[type="application/ld+json"]').each((_, node) => {
    const text = $(node).text().trim();
    try {
      visit(JSON.parse(text));
    } catch {
      if (/}\s*}\s*$/.test(text)) {
        try {
          visit(JSON.parse(text.replace(/}\s*}\s*$/, '}')));
        } catch {}
      }
    }
  });
  return records;
}
export const hasType = (value: Record<string, any>, type: string) =>
  [value['@type']].flat().includes(type);
