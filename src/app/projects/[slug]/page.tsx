import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { areas, getProject, projects } from "@/data/projects";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return projects.map((project) => ({ slug: project.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};

  return {
    title: project.title,
    description: project.description,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      type: "article",
      title: project.title,
      description: project.description,
      url: `/projects/${project.slug}`,
    },
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const { default: CaseStudy } = await import(
    `@/content/projects/${project.slug}.mdx`
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All projects
      </Link>

      <header className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {areas[project.area].label} · {project.year}
        </p>
        <h1 className="text-4xl font-medium tracking-tight text-balance">
          {project.title}
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          {project.tagline}
        </p>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium">{project.role}</dd>
          <dt className="text-muted-foreground">Stack</dt>
          <dd className="flex flex-wrap gap-1.5">
            {project.stack.map((tech) => (
              <Badge key={tech} variant="secondary">
                {tech}
              </Badge>
            ))}
          </dd>
          {project.links.live || project.links.repo ? (
            <>
              <dt className="text-muted-foreground">Links</dt>
              <dd className="flex flex-wrap gap-4">
                {project.links.live ? (
                  <a
                    href={project.links.live}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-muted-foreground"
                  >
                    Live site
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
                {project.links.repo ? (
                  <a
                    href={project.links.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-muted-foreground"
                  >
                    Source
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      </header>

      <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-medium prose-headings:tracking-tight">
        <CaseStudy />
      </article>
    </main>
  );
}
