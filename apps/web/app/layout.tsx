import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'PRICE ATLAS — Find your better price',
  description:
    'Compare exact variants, explore recorded prices, and set your target. Synthetic demonstration environment.',
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
