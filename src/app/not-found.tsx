import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="studio-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <Logo className="size-12" />
      <p className="mt-8 text-sm font-medium tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-3 max-w-md text-balance text-muted-foreground">
        The link may be broken, or the room may have already closed.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Back to VoiceMeet</Link>
      </Button>
    </main>
  );
}
