import { AlertTriangle } from 'lucide-react';
import type { SafetyFlag, SafetyFlagKind } from '@app-starter/shared';
import { cn } from '@/lib/utils';
import { SourceLinks } from './SourceLink';

const KIND_LABELS: Readonly<Record<SafetyFlagKind, string>> = {
  ALLERGY_CONFLICT: 'Allergy conflict',
  DRUG_INTERACTION: 'Drug interaction',
  DRUG_CONDITION: 'Drug and condition',
  CONTRADICTION: 'Record contradiction',
};

export const SafetyFlagList = ({ flags }: { flags: readonly SafetyFlag[] }) => (
  <section aria-labelledby="flags-heading" className="space-y-2">
    <h2 id="flags-heading" className="text-sm font-semibold">
      Safety flags
      <span className="ml-2 font-normal text-muted-foreground">{flags.length}</span>
    </h2>

    {flags.length === 0 ? (
      <p className="text-sm text-muted-foreground">No rule-based flags for this patient.</p>
    ) : (
      <ul className="space-y-2">
        {flags.map((flag, index) => (
          <li
            key={`${flag.kind}-${index}`}
            className={cn(
              'rounded-md border-l-4 p-3',
              flag.severity === 'HIGH'
                ? 'border-destructive bg-destructive/10'
                : 'border-amber-500 bg-amber-500/10',
            )}
          >
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  flag.severity === 'HIGH' ? 'text-destructive' : 'text-amber-600',
                )}
                aria-hidden="true"
              />
              <span>
                <span className="font-medium">
                  {KIND_LABELS[flag.kind]}
                  <span className="sr-only"> ({flag.severity.toLowerCase()} severity)</span>:
                </span>{' '}
                {flag.message}
              </span>
            </p>
            <div className="mt-1 pl-6">
              <SourceLinks sources={flag.sources} />
            </div>
          </li>
        ))}
      </ul>
    )}

    <p className="text-xs text-muted-foreground">
      Flags come from a small fixed rule table, not a full interaction database. Absence of a flag
      is not clearance.
    </p>
  </section>
);
