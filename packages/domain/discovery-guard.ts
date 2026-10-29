import { normalizeQuery, bundleMismatch } from './search';
import { variantSignature, compareVariants } from './variant-guard';

// Discovery is a lead, not an offer; explicit identity conflicts still disqualify it.
export function discoveryConflict(title: string, query: string) {
  const name = normalizeQuery(title);
  const requested = normalizeQuery(query);
  const tokens = new Set(name.split(' '));
  if (bundleMismatch(title, query)) return true;
  if (requested.split(' ').some((token) => /\d/.test(token) && !tokens.has(token))) return true;
  const accessory =
    /\b(?:case|cover|sleeve|protector|replacement|earpads|adapter|charger|cable|stand)\b/i;
  if (accessory.test(name) && !accessory.test(requested)) return true;
  if (/\bkobo\b/.test(requested)) {
    const models = ['libra', 'clara', 'sage', 'forma', 'elipsa', 'nia', 'aura', 'glo'];
    const selected = models.filter((model) => requested.split(' ').includes(model));
    if (selected.length && models.some((model) => tokens.has(model) && !selected.includes(model)))
      return true;
  }
  return compareVariants(variantSignature(title), variantSignature(query)).decision === 'rejected';
}
