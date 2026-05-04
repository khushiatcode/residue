import type { Metadata } from 'next';
import { Fragment_Mono } from 'next/font/google';
import './globals.css';

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fragment-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RESIDUE',
  description: 'Your typing, made visible.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fragmentMono.variable}>
      <body>{children}</body>
    </html>
  );
}
