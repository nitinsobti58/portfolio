import Link from "next/link";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { site } from "@/lib/site";

const nav = [
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-medium tracking-tight transition-colors hover:text-muted-foreground"
        >
          {site.name}
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
