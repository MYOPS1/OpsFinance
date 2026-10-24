import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://opsfinance.local'),
  title: 'OpsFinance | Accounting Made Simple',
  description:
    'OpsFinance helps Malaysian SMEs record transactions, upload bank statements and invoices, and view financial reports.',
  icons: {
    icon: '/favicon.svg',
  },
  alternates: {
    canonical: '/opsfinance',
  },
  openGraph: {
    title: 'OpsFinance | Accounting Made Simple',
    description: 'The simple cloud-based accounting platform for Malaysian SMEs.',
    url: 'https://opsfinance.local/opsfinance',
    type: 'website',
    locale: 'ms_MY',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
