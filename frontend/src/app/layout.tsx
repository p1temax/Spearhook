import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// Nova preset typography: Geist for UI text, Geist Mono for the brand wordmark
// and code surfaces.
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-brand-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spearhook — Phishing Operations Console",
  description:
    "Self-hosted phishing operations console for authorized red-team exercises.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var raw=localStorage.getItem("spearhook.theme");var t=raw?JSON.parse(raw).state.theme:null;var dark=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",dark);document.documentElement.style.colorScheme=dark?"dark":"light";}catch(e){}})();',
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
