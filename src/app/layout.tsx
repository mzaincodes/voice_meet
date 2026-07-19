import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { MotionProvider } from "@/components/motion-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeScript } from "@/components/theme-script";
import { SettingsProvider } from "@/contexts/settings-context";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VoiceMeet — Crystal-clear voice rooms",
    template: "%s · VoiceMeet",
  },
  description:
    "Instant, peer-to-peer voice rooms for up to five people. No downloads, no sign-up — just share a room ID and talk.",
  applicationName: "VoiceMeet",
  keywords: ["voice chat", "webrtc", "audio call", "voice room", "peer to peer"],
  openGraph: {
    title: "VoiceMeet — Crystal-clear voice rooms",
    description:
      "Instant, peer-to-peer voice rooms for up to five people. No downloads, no sign-up.",
    type: "website",
    siteName: "VoiceMeet",
  },
  twitter: {
    card: "summary_large_image",
    title: "VoiceMeet — Crystal-clear voice rooms",
    description: "Instant, peer-to-peer voice rooms for up to five people.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#101218" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <MotionProvider>
          <SettingsProvider>
            {children}
            <Toaster />
          </SettingsProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
