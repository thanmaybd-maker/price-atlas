import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isLive, session } from '@database/runtime';
import { syncAccount } from '@database/postgres';
export const safeReturn = (value: string | null) =>
  value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/watchlist';
export async function authClient() {
  const jar = await cookies();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    throw new Error('Supabase authentication is not configured.');
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) jar.set(name, value, options);
      },
    },
  });
}
export async function account(token?: string) {
  if (!isLive()) return session(token) || null;
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return syncAccount(data.user);
}
export async function isAdmin() {
  if (!isLive()) return false;
  const client = await authClient();
  const { data } = await client.auth.getUser();
  if (!data.user || !(process.env.ADMIN_USER_IDS || '').split(',').includes(data.user.id))
    return false;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return assurance.data?.currentLevel === 'aal2';
}
