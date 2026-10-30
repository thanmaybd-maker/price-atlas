import { categoryLabels } from './categories';
const pages = new Set([
  'search',
  'categories',
  'compare',
  'watchlist',
  'alerts',
  'settings',
  'admin',
  'about',
  'help',
]);
export function knownPagePath(pathname: string) {
  let parts: string[];
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return false;
  }
  if (!parts.length) return true;
  if (parts.length === 1) return pages.has(parts[0]) || parts[0] === 'unsubscribe';
  if (parts.length !== 2) return false;
  if (parts[0] === 'auth') return ['login', 'callback', 'confirm'].includes(parts[1]);
  if (parts[0] === 'category') return Object.hasOwn(categoryLabels, parts[1]);
  return parts[0] === 'p' && parts[1].length <= 100 && !/[\\/]/.test(parts[1]);
}
export function knownApiPath(parts: string[]) {
  if (parts.length === 1)
    return [
      'health',
      'session',
      'assist',
      'fx',
      'search',
      'suggestions',
      'offers',
      'history',
      'export',
      'imports',
      'discovery',
      'telegram',
      'preferences',
      'account',
      'watches',
      'rules',
      'reports',
      'admin',
      'auth',
      'unsubscribe',
      'mfa',
    ].includes(parts[0]);
  if (parts.length !== 2 || !parts[1]) return false;
  if (parts[0] === 'catalog') return parts[1] === 'status';
  if (['products', 'watches', 'rules'].includes(parts[0])) return true;
  return (
    parts[0] === 'admin' &&
    ['anomaly', 'retry', 'telegram', 'match', 'collect', 'provider'].includes(parts[1])
  );
}
