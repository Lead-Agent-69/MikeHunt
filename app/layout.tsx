import type { Metadata } from "next";
import "./globals.css";
import "./mobile.css";
import { ResponsiveProvider } from "@/components/ui/responsive-design-system";
import {
  NetworkProvider,
  NetworkStatusBanner,
} from "@/components/ui/mobile-ux";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { PWARegister } from "@/components/PWARegister";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Inter, Fraunces, Syne } from "next/font/google";
import { cn } from "@/lib/utils";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";

// Self-hosted at build time by next/font: no requests to fonts.googleapis.com or
// fonts.gstatic.com. Same families and weights the old globals.css @import loaded.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-sans",
});
const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-syne",
});
// Fraunces stays a variable font so it keeps the opsz axis; its wght range (100-900)
// covers the 400-700 the old import asked for. next/font rejects axes with fixed weights.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "MikeHunt - Vehicle Sourcing Intelligence",
  description:
    "Smart vehicle sourcing platform for dealers with real-time market intelligence and profit optimization",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MikeHunt",
  },
  openGraph: {
    title: "MikeHunt - Vehicle Sourcing Intelligence",
    description: "Smart vehicle sourcing platform for dealers",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#075BE8",
};

import { LenisSmoothScroll } from "@/components/ui/framer-components";

const enableSpeedInsights =
  process.env.VERCEL === "1" ||
  process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === "1";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full bg-[var(--s1)]",
        "font-sans",
        inter.variable,
        syne.variable,
        fraunces.variable,
      )}
    >
      <head>
        {/* Resolve theme before first paint to avoid a flash. Reads the saved
            preference (light | dark | system) and applies data-theme to <html>. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var m=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=t==='dark'||(t==='system'&&m);document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        {/* iOS renders PNG (not SVG) for the home-screen icon. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <meta name="apple-mobile-web-app-title" content="MikeHunt" />
        <meta name="theme-color" content="#075BE8" />
        <meta name="msapplication-TileColor" content="#075BE8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="h-full min-h-screen bg-[var(--s1)] text-[var(--t1)] antialiased overflow-x-clip">
        <NetworkProvider>
          <NetworkStatusBanner />
          <SWRProvider>
            <ErrorBoundary>
              <ResponsiveProvider>
                <LenisSmoothScroll>
                  {children}
                  {enableSpeedInsights && <SpeedInsights />}
                  <PageViewTracker />
                  <ToastProvider />
                  <PWARegister />
                  <InstallPrompt />
                </LenisSmoothScroll>
              </ResponsiveProvider>
            </ErrorBoundary>
          </SWRProvider>
        </NetworkProvider>
      </body>
    </html>
  );
}
