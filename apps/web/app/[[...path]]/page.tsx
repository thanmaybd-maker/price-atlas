import { catalog, offers, history, findProduct } from '@database/index';
import Atlas from '@/components/atlas';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const product = path[0] === 'p' ? findProduct(path[1]) : undefined;
  return (
    <Atlas
      route={path}
      initialProducts={catalog()}
      initialOffers={offers()}
      initialHistory={product ? history(product.id, 90) : []}
    />
  );
}
