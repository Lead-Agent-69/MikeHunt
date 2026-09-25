import type { Metadata } from "next";
import "./globals.css";
import { ResponsiveProvider } from "@/components/ui/responsive-design-system";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { PWARegister } from "@/components/PWARegister";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Inter, Fraunces } from "next/font/google";
import { cn } from "@/lib/utils";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "DealerHunt - Vehicle Sourcing Intelligence",
  description:
    "Smart vehicle sourcing platform for dealers with real-time market intelligence and profit optimization",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DealerHunt",
  },
  openGraph: {
    title: "DealerHunt - Vehicle Sourcing Intelligence",
    description: "Smart vehicle sourcing platform for dealers",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f25b9a",
};

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
        <meta name="apple-mobile-web-app-title" content="DealerHunt" />
        <meta name="theme-color" content="#f25b9a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="h-full min-h-screen bg-[var(--s1)] text-[var(--t1)] antialiased overflow-x-hidden">
        <SWRProvider>
          <ErrorBoundary>
            <ResponsiveProvider>
              {children}
              <SpeedInsights />
              <ToastProvider />
              <PWARegister />
              <InstallPrompt />
            </ResponsiveProvider>
          </ErrorBoundary>
        </SWRProvider>
      </body>
    </html>
  );
}
