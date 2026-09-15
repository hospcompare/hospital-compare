import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { PipelineBanner } from "@/components/pipeline-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Hospital Compare",
    template: "%s · Hospital Compare",
  },
  description:
    "Compare U.S. hospitals on pay, work-environment proxies, cost of living, and peer reviews. Data is served from a validation pipeline — never written live by agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <PipelineBanner />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
            Hospital Compare is a workplace directory for travel and staff nurses. Production
            pages read PostgreSQL only. CMS CCN is the hospital primary key.
          </div>
        </footer>
      </body>
    </html>
  );
}
