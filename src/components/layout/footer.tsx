import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
        <nav aria-label="Contact" className="flex gap-4">
          <a href={`mailto:${site.author.email}`} className="hover:text-foreground">
            Email
          </a>
          <a
            href={site.author.github}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href={site.author.linkedin}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
