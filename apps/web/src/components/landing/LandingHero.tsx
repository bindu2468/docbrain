import { BRAND_NAME } from '@/lib/brand';

export default function LandingHero() {
  return (
    <section className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to {BRAND_NAME}</h1>
      <p className="text-lg text-muted-foreground mb-4">
        Sign in to see today&apos;s schedule and your patients&apos; pre-visit briefs.
      </p>
    </section>
  );
}
