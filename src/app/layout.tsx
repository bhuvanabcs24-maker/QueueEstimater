import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '../components/PwaRegister';

export const metadata: Metadata = {
  title: 'QWait Estimator - Realtime Queue Wait Times',
  description: 'Know your queue wait time and check in instantly. Works at clinic sites via QR scanner + GPS geofencing.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QWait',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0f12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
