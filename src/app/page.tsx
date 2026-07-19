import { FeatureCards } from "@/components/landing/feature-cards";
import { LandingExperience } from "@/components/landing/landing-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Server Component shell. Only the interactive island
 * (`LandingExperience`) and the animated cards ship as client bundles.
 */
export default function HomePage() {
  return (
    <div className="studio-bg flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <LandingExperience />
        <FeatureCards />
      </main>
      <SiteFooter />
    </div>
  );
}
