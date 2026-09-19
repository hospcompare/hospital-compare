import Link from "next/link";
import { Activity } from "lucide-react";

const links = [
  { href: "/hospitals", label: "Search hospitals" },
  { href: "/compare", label: "Compare hospitals" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-teal-950/10 bg-teal-950 text-teal-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal-800 text-teal-50">
            <Activity className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-heading text-lg leading-tight tracking-tight">
              Hospital Compare
            </span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-teal-200/80">
              Healthcare workplace insights
            </span>
          </span>
        </Link>
        <nav className="flex flex-wrap gap-2 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-teal-100/20 bg-teal-900/40 px-3 py-1.5 text-teal-50 hover:bg-teal-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
