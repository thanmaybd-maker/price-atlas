import { Suspense } from 'react';
import { LiveLogin } from '@/components/live-login';
export default function Login() {
  return (
    <main className="page-width utility-page narrow">
      <h1>Sign in to Price Atlas</h1>
      <Suspense>
        <LiveLogin />
      </Suspense>
    </main>
  );
}
