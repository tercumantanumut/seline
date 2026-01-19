import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { GlobalSyncWrapper } from "@/components/vector-search";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TaskNotificationProvider } from "@/components/schedules/task-notification-provider";
import { loadSettings } from "@/lib/settings/settings-manager";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Seline - Build & Chat with AI Agents",
  description:
    "Create configurable AI agents for work and creativity. Chat, generate content and media, and connect tools to power your workflows.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const settings = loadSettings();
  const initialTheme = settings.theme ?? "system";
  const themeScript = `
(() => {
  try {
    const storageKey = "seline-theme";
    const root = document.documentElement;
    const stored = localStorage.getItem(storageKey);
    const preference = stored || root.dataset.theme || "system";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    root.dataset.theme = preference;
  } catch {}
})();
  `;

  return (
    <html
      lang={locale}
      data-theme={initialTheme}
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased font-sans">
        <Script id="theme-script" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ThemeProvider initialTheme={initialTheme}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <GlobalSyncWrapper>
              <AuthProvider>
                <TaskNotificationProvider>
                  {children}
                </TaskNotificationProvider>
              </AuthProvider>
            </GlobalSyncWrapper>
            <Toaster
              position="bottom-right"
              toastOptions={{
                className: "font-mono text-sm",
                style: {
                  background: "hsl(var(--terminal-cream))",
                  color: "hsl(var(--terminal-dark))",
                  border: "1px solid hsl(var(--terminal-dark))",
                },
              }}
            />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
