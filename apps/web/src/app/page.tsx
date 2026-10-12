import Link from 'next/link';
import { Brain, History, ShieldAlert, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UniversalLayout } from '@/components/layout/UniversalLayout';
import { BRAND_NAME } from '@/lib/brand';

export const metadata = {
  title: BRAND_NAME,
  description:
    'Pre-visit patient briefs for doctors: allergies first, what changed since the last visit, and every fact linked to its source.',
};

const CAPABILITIES = [
  {
    icon: ShieldAlert,
    title: 'Allergies and safety flags first',
    description:
      'Allergies are always shown, never filtered. Rule-based checks flag allergy conflicts, drug interactions, and records that contradict each other.',
  },
  {
    icon: History,
    title: 'What changed since your last visit',
    description:
      'New labs, medications started by other doctors, missed appointments, and lab trends — measured from the last time you saw the patient.',
  },
  {
    icon: Stethoscope,
    title: 'One patient, every specialty',
    description:
      'A cardiologist and an endocrinologist read the same record through their own lens, so a link between their specialties stands out.',
  },
  {
    icon: Brain,
    title: 'Ask the patient brain',
    description:
      "Ask in plain language. Answers come from the patient's own records, searched with HydraDB, and cite the record behind every claim.",
  },
];

/**
 * Marketing home. Authenticated users are sent to /dashboard by the header,
 * so this stays a plain public page rather than redirecting.
 */
export default function HomePage() {
  return (
    <UniversalLayout>
      <main className="mx-auto max-w-5xl px-4 py-20">
        <section className="space-y-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Know your patient before you walk in
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            {BRAND_NAME} turns a scattered chart into a 30-second pre-visit brief: allergies first,
            what changed since the last visit, and what other doctors did — with every fact linked
            to the record it came from.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/get-started">How it works</Link>
            </Button>
          </div>
        </section>

        <section className="mt-20 grid gap-8 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-4">
              <Icon className="mt-1 h-6 w-6 shrink-0 text-teal" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="text-base font-medium">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </section>

        <p className="mt-16 text-center text-xs text-muted-foreground">
          Decision support, not diagnosis — the doctor decides. This build holds synthetic patients
          only.
        </p>
      </main>
    </UniversalLayout>
  );
}
