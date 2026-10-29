import { catalog, offers, history, findProduct } from '@database/runtime';
import Atlas from '@/components/atlas';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const [products, currentOffers, product] = await Promise.all([
    catalog(),
    offers(),
    path[0] === 'p' ? findProduct(path[1]) : Promise.resolve(undefined),
  ]);
  const observations = product ? await history(product.id, 90) : [];
  return (
    <Atlas
      route={path}
      mode={process.env.APP_MODE === 'live' ? 'live' : 'demo'}
      initialProducts={products}
      initialOffers={currentOffers}
      initialHistory={observations}
    />
  );
}
