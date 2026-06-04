'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { useExamStore } from '@/store/useExamStore';
import { useSyncExternalStore } from 'react';

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap' });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useExamStore((state) => state.theme);
  const zoom = useExamStore((state) => state.zoom);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <html lang="vi" data-theme={mounted ? theme : 'light'} suppressHydrationWarning>
      <head>
        <title>Thi Tốt Nghiệp THPT Quốc Gia</title>
      </head>
      <body className={inter.className} style={{ '--answer-font': `${Math.round(17 * (mounted ? zoom : 100) / 100)}px` } as React.CSSProperties}>
        <main id="app">
          {children}
        </main>
      </body>
    </html>
  );
}
