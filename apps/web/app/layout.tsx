import type { Metadata } from 'next';
import './globals.css';
import './atlas-v2.css';
export const metadata: Metadata = {
  title: 'PRICE ATLAS — Find your better price',
  description:
    'Search products across Indian and international retailers, compare exact variants, explore recorded prices, and set price targets.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
