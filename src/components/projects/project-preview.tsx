"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { areas, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type Props = {
  /** Stays set while the sheet animates closed so the content does not vanish mid-transition. */
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes; the caller clears `project` here. */
  onClosed?: () => void;
  /** Where focus goes when the sheet closes — the pill that opened it. */
  finalFocus?: ComponentProps<typeof SheetContent>["finalFocus"];
};

/** Slide-in preview of one project with a link through to its case study. */
export function ProjectPreview({ project, open, onOpenChange, onClosed, finalFocus }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <SheetContent side="right" finalFocus={finalFocus} className="gap-0">
        {project && (
          <>
            <SheetHeader className="gap-2 pr-12">
              <p className="text-xs text-muted-foreground">
                {areas[project.area].label} · {project.year} · {project.role}
              </p>
              <SheetTitle className="text-lg tracking-tight">{project.title}</SheetTitle>
              <SheetDescription className="text-pretty">{project.tagline}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4">
              <p className="text-sm text-muted-foreground text-pretty">{project.description}</p>
              <ul aria-label="Stack" className="flex flex-wrap gap-1.5">
                {project.stack.map((tech) => (
                  <li key={tech}>
                    <Badge variant="secondary">{tech}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <SheetFooter className="flex-row flex-wrap gap-2">
              <Link href={`/projects/${project.slug}`} className={cn(buttonVariants())}>
                View case study
                <ArrowRight data-icon="inline-end" />
              </Link>
              {project.links.live && (
                <a
                  href={project.links.live}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Live site
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              )}
              {project.links.repo && (
                <a
                  href={project.links.repo}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Repository
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
