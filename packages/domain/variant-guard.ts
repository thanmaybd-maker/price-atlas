export type VariantSignature = {
  bundle: boolean;
  condition: 'NEW' | 'REFURBISHED' | 'USED' | 'OPEN_BOX' | 'UNKNOWN';
  packCount: number | null;
  storageOrMemory?: string;
  volumeOrWeight?: string;
  bookBinding?: 'PAPERBACK' | 'HARDCOVER' | 'KINDLE' | 'SPIRAL';
  editionOrModel?: string;
  shade?: string;
  size?: string;
};
const normal = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '');
function quantity(s: string) {
  const m = s
    .toLowerCase()
    .match(
      /\b(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|litres?|liters?|l|kg|kilograms?|grams?|g)\b/,
    );
  if (!m) return undefined;
  const unit = m[2];
  const volume = /^(?:ml|milli|l)/.test(unit);
  const factor = /^(?:l$|litr|liter|kg|kilo)/.test(unit) ? 1000 : 1;
  return `${Math.round(Number(m[1]) * factor * 1000) / 1000}${volume ? 'ml' : 'g'}`;
}
export function variantSignature(title: string, a: Record<string, string> = {}): VariantSignature {
  const text = `${title} ${a.Condition || ''}`;
  const packText = a.Pack || a['Net Quantity'] || a['Number of Items'] || '';
  const pack =
    /^(\d+)$/.exec(packText)?.[1] ||
    /\b(?:pack|set)\s*(?:of\s*)?(\d+)\b/i.exec(`${packText} ${title}`)?.[1] ||
    /\b(\d+)\s*pack\b/i.exec(title)?.[1];
  const binding = `${a.Binding || ''} ${title}`;
  const edition = a.Edition || /\b(\d+)(?:st|nd|rd|th)?\s+edition\b/i.exec(title)?.[1];
  const model =
    a['Model Number'] ||
    /\b(?:fx-?\d+[a-z]+(?:\s+plus)?|hd\d+\/\d+|(?:wh|wf|mdr)-[a-z0-9-]+)\b/i.exec(title)?.[0];
  const memory =
    [a.RAM, a.Storage].filter(Boolean).join('/') ||
    a['Variant memory'] ||
    (title.match(/\b\d+\s*(?:GB|TB)\b/gi) || []).join('/');
  return {
    bundle: /\b(?:bundle|combo|kit)\b/i.test(title) || a.Bundle === 'yes',
    condition: /open[ -]?box/i.test(text)
      ? 'OPEN_BOX'
      : /refurbished|renewed/i.test(text)
        ? 'REFURBISHED'
        : /\bused\b/i.test(text)
          ? 'USED'
          : /^new$/i.test(a.Condition || '')
            ? 'NEW'
            : 'UNKNOWN',
    packCount: pack && Number(pack) > 0 ? Number(pack) : null,
    storageOrMemory: memory ? normal(memory) : undefined,
    volumeOrWeight: quantity(a.Size || a.Capacity || '') || quantity(title),
    bookBinding: /paperback|softcover/i.test(binding)
      ? 'PAPERBACK'
      : /hardcover|hardback/i.test(binding)
        ? 'HARDCOVER'
        : /kindle|ebook/i.test(binding)
          ? 'KINDLE'
          : /spiral/i.test(binding)
            ? 'SPIRAL'
            : undefined,
    editionOrModel: edition
      ? normal(String(edition).replace(/(?:st|nd|rd|th)?\s*edition/gi, ''))
      : model
        ? normal(model)
        : undefined,
    shade: a.Shade ? normal(a.Shade) : undefined,
    size: a.Size ? quantity(a.Size) || normal(a.Size) : undefined,
  };
}
export function compareVariants(a: VariantSignature, b: VariantSignature) {
  const conflicts: string[] = [],
    unknown: string[] = [];
  for (const key of Object.keys(a) as (keyof VariantSignature)[]) {
    const x = a[key],
      y = b[key];
    if (x === 'UNKNOWN' && y === 'UNKNOWN') continue;
    if (x == null && y == null) continue;
    if (x == null || y == null || x === 'UNKNOWN' || y === 'UNKNOWN') unknown.push(key);
    else if (x !== y) conflicts.push(key);
  }
  return {
    decision: conflicts.length ? 'rejected' : unknown.length ? 'review' : 'accepted',
    conflicts,
    unknown,
  } as const;
}
export function variantAttributes(title: string, attributes: Record<string, string>) {
  const s = variantSignature(title, attributes),
    out = { ...attributes };
  if (s.bundle) out.Bundle = 'yes';
  if (s.packCount) out.Pack ||= String(s.packCount);
  if (s.volumeOrWeight) out.Size ||= s.volumeOrWeight;
  if (s.bookBinding) out.Binding ||= s.bookBinding;
  if (s.editionOrModel && /\bedition\b/i.test(title)) out.Edition ||= s.editionOrModel;
  else if (s.editionOrModel) out['Model Number'] ||= s.editionOrModel;
  if (s.storageOrMemory) out['Variant memory'] ||= s.storageOrMemory;
  return out;
}
export function variantLabel(title: string, attributes: Record<string, string>) {
  const s = variantSignature(title, attributes);
  return [
    s.condition.toLowerCase().replace('_', ' '),
    s.bundle ? 'Bundle / kit' : '',
    s.packCount ? `Pack of ${s.packCount}` : '',
    s.bookBinding?.toLowerCase(),
    attributes.Shade,
    attributes.Size,
  ]
    .filter(Boolean)
    .join(' • ');
}
