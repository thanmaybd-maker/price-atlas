import { total, type Offer, type Product } from './index';
import { retailers } from './retailers';
export function historyEvidence(
  product: Product,
  observations: Offer[],
  basis: 'item' | 'delivered',
  now = Date.now(),
) {
  const rows = observations.filter(
    (o) =>
      o.productId === product.id &&
      o.historyAllowed &&
      o.accepted &&
      o.condition === 'new' &&
      o.currency === 'INR' &&
      !retailers[o.store].international &&
      o.observedAt <= now,
  );
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const price = (value: number | null) => (value === null ? 'Unknown' : (value / 100).toFixed(2));
  const data: unknown[][] = [
    [
      'Product',
      'Product ID',
      'Store',
      'Observed at (UTC)',
      'Currency',
      'Item price',
      'Shipping',
      'Mandatory charges',
      'Price basis',
      'Comparison price',
      'Stock',
      'Condition',
      'Source URL',
      'Evidence type',
    ],
  ];
  for (const o of rows)
    data.push([
      product.name,
      product.id,
      o.store,
      new Date(o.observedAt).toISOString(),
      o.currency,
      price(o.itemPrice),
      price(o.shipping),
      price(o.charges),
      basis,
      price(total(o, basis)),
      o.stock ? 'In stock' : 'Not confirmed / unavailable',
      o.condition,
      o.purchaseUrl || '',
      'Recorded observation; verify at checkout',
    ]);
  return '\uFEFF' + data.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
