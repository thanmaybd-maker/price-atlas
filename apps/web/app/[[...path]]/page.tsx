import { history, findProduct, offers } from '@database/runtime';
import { publicCatalog } from '@/lib/public-data';
import Atlas from '@/components/atlas';
import { notFound } from 'next/navigation';
import { catalogCard } from '../../../../packages/domain/catalog-card';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const [snapshot, product] = await Promise.all([
    publicCatalog(),
    path[0] === 'p' ? findProduct(path[1]) : Promise.resolve(undefined),
  ]);
  const [observations, productOffers] = product
    ? await Promise.all([history(product.id, 90), offers(product.id)])
    : [[], []];
  if (path[0] === 'p' && !product) notFound();
  return (
    <Atlas
      route={path}
      mode={process.env.APP_MODE === 'live' ? 'live' : 'demo'}
      initialProducts={
        product && !snapshot.products.some((p) => p.id === product.id)
          ? [product, ...snapshot.products]
          : path.length === 0
            ? snapshot.products.map(catalogCard)
            : snapshot.products
      }
      initialOffers={
        product
          ? [...productOffers, ...snapshot.offers.filter((offer) => offer.productId !== product.id)]
          : snapshot.offers
      }
      initialHistory={observations}
    />
  );
}
