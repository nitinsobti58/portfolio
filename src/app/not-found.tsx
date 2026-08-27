import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-4 px-4 py-24 sm:px-6">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-medium tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        That page doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Back home
      </Link>
    </main>
  );
}
