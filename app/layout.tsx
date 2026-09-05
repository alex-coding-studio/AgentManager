import type { Metadata } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { readAppSettings } from '@/lib/app-settings';
import { UiLanguageProvider } from '@/components/ui-language-provider';
import { AppearanceProvider } from '@/components/appearance-provider';
import { THEME_BOOTSTRAP } from '@/lib/ui-theme';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Praxis',
  description:
    'From intent to action. A local-first workspace for one person and AI agents.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { language, theme } = await readAppSettings();
  return (
    <html
      lang={language}
      data-theme={theme}
      className={theme === 'dark' ? 'dark' : undefined}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="appearance-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UiLanguageProvider key={language} language={language}>
          <AppearanceProvider key={theme} theme={theme}>
            {children}
          </AppearanceProvider>
        </UiLanguageProvider>
      </body>
    </html>
  );
}
