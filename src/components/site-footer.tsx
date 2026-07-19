import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/60 py-8">
      <div className="mx-auto flex w-[min(100%-2rem,72rem)] flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo className="size-5" />
          <span className="font-medium text-foreground">VoiceMeet</span>
        </div>
        <p className="text-center sm:text-right">
          Peer-to-peer audio. Your conversation never touches our servers.
        </p>
      </div>
    </footer>
  );
}
