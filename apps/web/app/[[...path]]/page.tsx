import { catalog, offers, history, findProduct } from '@database/runtime';
import Atlas from '@/components/atlas';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const product = path[0] === 'p' ? await findProduct(path[1]) : undefined;
  return (
    <Atlas
      route={path}
      mode={process.env.APP_MODE === 'live' ? 'live' : 'demo'}
      initialProducts={await catalog()}
      initialOffers={await offers()}
      initialHistory={product ? await history(product.id, 90) : []}
    />
  );
}
