import * as demo from './index';
import * as live from './postgres';
export const isLive = () => process.env.APP_MODE === 'live';
const repository = () => (isLive() ? live : demo);
export const catalog = async () => repository().catalog();
export const offers = async (id?: string) => repository().offers(id);
export const findProduct = async (id: string) => repository().findProduct(id);
export const history = async (id: string, days = 30) => repository().history(id, days);
export const historyOverview = async (ids: string[], days = 30) => {
  if (isLive()) return live.historyOverview(ids, days);
  const products = (await demo.catalog())
    .filter((product) => !ids.length || ids.includes(product.id))
    .slice(0, 4);
  const rows = await Promise.all(
    products.map(async (product) => [product.id, await demo.history(product.id, days)] as const),
  );
  return { products, history: Object.fromEntries(rows) };
};
export const personal = async (id: string) => repository().personal(id);
export const saveWatch = async (id: string, p: string, c?: string) =>
  repository().saveWatch(id, p, c);
export const removeWatch = async (id: string, p: string) => repository().removeWatch(id, p);
export const saveRule = async (id: string, input: live.RuleInput, deferEvaluation = false) =>
  isLive() ? live.saveRule(id, input, deferEvaluation) : demo.saveRule(id, input);
export const evaluateProduct = async (id: string) => {
  if (isLive()) await live.evaluateProduct(id);
};
export const deleteRule = async (id: string, r: string) => repository().deleteRule(id, r);
export const preferences = async (id: string, enabled: boolean, emailEnabled?: boolean) =>
  isLive() ? live.preferences(id, enabled, emailEnabled) : demo.preferences(id, enabled);
export const deleteAccount = async (id: string) => repository().deleteAccount(id);
export const report = async (id: string | null, p: string, r: string) =>
  repository().report(id, p, r);
export const admin = async () => repository().admin();
export const pauseProvider = async (s: string, p: boolean, a: string, r: string) =>
  repository().pauseProvider(s, p, a, r);
export const collect = async () => repository().collect();
export const dispatch = async () => repository().dispatch();
export const session = demo.session;
export const createSession = demo.createSession;
export const logout = demo.logout;
