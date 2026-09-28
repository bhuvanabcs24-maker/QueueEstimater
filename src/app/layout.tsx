import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '../components/PwaRegister';

export const metadata: Metadata = {
  title: 'CareQueue | Healthcare Wait-Time & Patient Triage System',
  description: 'Enterprise outpatient queue estimation, on-site GPS check-in, and real-time patient queue monitoring.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CareQueue',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
