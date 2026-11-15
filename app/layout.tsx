import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { GameProvider } from "@/components/game/game-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cosa Nostra — Table Companion",
  description:
    "A mobile-first mock UI for the Cosa Nostra social deduction game.",
};

async function IntlShell({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <NextIntlClientProvider>
      <div
        lang={locale}
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip border-x bg-background"
      >
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-muted/40 text-foreground">
        <GameProvider>
          <Suspense
            fallback={
              <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x bg-background" />
            }
          >
            <IntlShell>{children}</IntlShell>
          </Suspense>
        </GameProvider>
      </body>
    </html>
  );
}
