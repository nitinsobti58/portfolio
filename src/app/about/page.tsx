import { FileText } from "lucide-react";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Nitin Sobti: computer science student focused on finance and software, with a resume and contact details.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-medium tracking-tight">About</h1>
        {/* TODO: replace with a real bio. */}
        <p className="text-lg text-muted-foreground text-pretty">
          I&apos;m a computer science student with a focus on finance. I build
          software that touches real markets: data pipelines, trading tools, and
          the products around them. I care about systems that are simple to
          reason about and honest about their trade-offs.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={site.resumePath}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: "lg" })}
        >
          <FileText data-icon="inline-start" />
          Resume
        </a>
        <a
          href={`mailto:${site.author.email}`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Email
        </a>
      </div>

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Email</dt>
        <dd>
          <a href={`mailto:${site.author.email}`} className="underline underline-offset-4">
            {site.author.email}
          </a>
        </dd>
        <dt className="text-muted-foreground">GitHub</dt>
        <dd>
          <a
            href={site.author.github}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            {site.author.github.replace("https://", "")}
          </a>
        </dd>
        <dt className="text-muted-foreground">LinkedIn</dt>
        <dd>
          <a
            href={site.author.linkedin}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            {site.author.linkedin.replace("https://", "")}
          </a>
        </dd>
      </dl>
    </main>
  );
}
