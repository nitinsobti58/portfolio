import { areas, getProject, projects } from "@/data/projects";
import { ogContentType, ogImage, ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = ogContentType;

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);

  return ogImage({
    eyebrow: project ? `${areas[project.area].label} · ${project.year}` : undefined,
    title: project?.title ?? "Project",
    subtitle: project?.tagline,
  });
}
