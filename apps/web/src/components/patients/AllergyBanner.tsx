import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AllergyRecord } from '@app-starter/shared';
import { Badge } from '@/components/ui/badge';
import { recordAnchor } from '@/lib/clinical-format';
import { cn } from '@/lib/utils';

/**
 * Allergies, always first and always complete. This renders straight from the
 * record — no specialty lens or model decides whether an allergy is shown.
 * "None recorded" is stated explicitly, because a missing banner and an empty
 * one must not look the same.
 */
export const AllergyBanner = ({ allergies }: { allergies: readonly AllergyRecord[] }) => {
  const hasAllergies = allergies.length > 0;

  return (
    <section
      aria-labelledby="allergies-heading"
      className={cn(
        'rounded-lg border-2 p-4',
        hasAllergies ? 'border-destructive bg-destructive/10' : 'border-border bg-muted/40',
      )}
    >
      <h2
        id="allergies-heading"
        className={cn(
          'flex items-center gap-2 text-sm font-semibold uppercase tracking-wide',
          hasAllergies ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {hasAllergies ? (
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        )}
        Allergies
      </h2>

      {hasAllergies ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {allergies.map((allergy) => (
            <li key={allergy.id}>
              <a
                href={`#${recordAnchor('ALLERGY', allergy.id)}`}
                className="inline-flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-semibold text-destructive">{allergy.substance}</span>
                <span className="text-muted-foreground">{allergy.reaction}</span>
                <Badge variant={allergy.severity === 'SEVERE' ? 'destructive' : 'outline'}>
                  {allergy.severity.toLowerCase()}
                </Badge>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">No known allergies recorded.</p>
      )}
    </section>
  );
};
