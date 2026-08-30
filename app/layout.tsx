import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { readAppSettings } from '@/lib/app-settings';
import { UiLanguageProvider } from '@/components/ui-language-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AgentManager',
  description: 'A local-first project workspace for one person and AI agents.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { language } = await readAppSettings();
  return (
    <html lang={language} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UiLanguageProvider key={language} language={language}>
          {children}
        </UiLanguageProvider>
      </body>
    </html>
  );
}
