'use client';

import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';
import { useExamStore } from '@/store/useExamStore';
import { useSyncExternalStore } from 'react';
import ToastProvider from '@/components/ui/Toast';

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-ui',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

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
    <html
      lang="vi"
      data-theme={mounted ? theme : 'light'}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <title>Thi Tốt Nghiệp THPT Quốc Gia</title>
      </head>
      <body
        className={`${beVietnam.variable} ${jetBrainsMono.variable}`}
        style={{ '--answer-font': `${Math.round(17 * (mounted ? zoom : 100) / 100)}px` } as React.CSSProperties}
      >
        <a className="skip-link" href="#app">Bỏ qua đến nội dung chính</a>
        <main id="app">
          {children}
        </main>
        <ToastProvider />
      </body>
    </html>
  );
}
