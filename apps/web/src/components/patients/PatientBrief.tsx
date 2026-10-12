import type { ReactNode } from 'react';
import { CalendarClock, History, Stethoscope, Users } from 'lucide-react';
import {
  MEDICAL_SPECIALTY_LABELS,
  type BriefChange,
  type ChangeKind,
  type PatientBriefResponse,
} from '@app-starter/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatClinicalDate, formatClinicalDateTime, recordAnchor } from '@/lib/clinical-format';
import { cn } from '@/lib/utils';
import { AllergyBanner } from './AllergyBanner';
import { LabTrendList } from './LabTrendList';
import { SafetyFlagList } from './SafetyFlagList';
import { SourceLink } from './SourceLink';

const CHANGE_LABELS: Readonly<Record<ChangeKind, string>> = {
  NEW_LAB: 'Lab',
  MEDICATION_STARTED: 'Started',
  MEDICATION_STOPPED: 'Stopped',
  NEW_DIAGNOSIS: 'Diagnosis',
  VISIT_ELSEWHERE: 'Other doctor',
  MISSED_VISIT: 'Missed',
};

const ChangeRow = ({ change }: { change: BriefChange }) => (
  <li className="flex gap-3 text-sm">
    <span className="w-24 shrink-0 text-xs text-muted-foreground">
      {formatClinicalDate(change.occurredAt)}
    </span>
    <div className="min-w-0 space-y-0.5">
      <p>
        <Badge
          variant={change.kind === 'MISSED_VISIT' ? 'destructive' : 'secondary'}
          className="mr-2"
        >
          {CHANGE_LABELS[change.kind]}
        </Badge>
        {change.message}
      </p>
      <SourceLink source={change.source} />
    </div>
  </li>
);

interface PatientBriefProps {
  brief: PatientBriefResponse;
  /**
   * Rendered straight after the allergies — the AI summary goes here, so
   * nothing generated ever sits above the allergy banner.
   */
  afterAllergies?: ReactNode;
}

/**
 * The pre-visit brief. Allergies first, then flags, then what changed — the
 * order a doctor needs it in the minute before walking into the room.
 */
export const PatientBrief = ({ brief, afterAllergies }: PatientBriefProps) => (
  <div className="space-y-6">
    <AllergyBanner allergies={brief.allergies} />

    {afterAllergies}

    <div className="grid gap-6 lg:grid-cols-2">
      <SafetyFlagList flags={brief.safetyFlags} />

      <section aria-labelledby="changes-heading" className="space-y-2">
        <h2 id="changes-heading" className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" aria-hidden="true" />
          {brief.changesSince
            ? `Since your last visit (${formatClinicalDate(brief.changesSince)})`
            : 'Since last visit'}
        </h2>
        {brief.changesSince === null && (
          <p className="text-sm text-muted-foreground">No earlier visit to compare against.</p>
        )}
        {brief.changesSince !== null && brief.changes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing new since then.</p>
        )}
        <ul className="space-y-3">
          {brief.changes.map((change) => (
            <ChangeRow
              key={`${change.source.type}-${change.source.id}-${change.kind}`}
              change={change}
            />
          ))}
        </ul>
      </section>
    </div>

    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Active conditions</CardTitle>
        </CardHeader>
        <CardContent>
          {brief.activeConditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {brief.activeConditions.map(({ diagnosis, isRelevant }) => (
                <li key={diagnosis.id} className={cn(!isRelevant && 'text-muted-foreground')}>
                  <a
                    href={`#${recordAnchor('DIAGNOSIS', diagnosis.id)}`}
                    className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className={cn(isRelevant && 'font-medium')}>{diagnosis.name}</span>
                  </a>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {diagnosis.code} · since {formatClinicalDate(diagnosis.diagnosedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Current medications</CardTitle>
        </CardHeader>
        <CardContent>
          {brief.currentMedications.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {brief.currentMedications.map((medication) => (
                <li key={medication.id}>
                  <a
                    href={`#${recordAnchor('MEDICATION', medication.id)}`}
                    className="rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {medication.name} {medication.dose}
                  </a>
                  <span className="ml-2 text-muted-foreground">{medication.frequency}</span>
                  <p className="text-xs text-muted-foreground">
                    Since {formatClinicalDate(medication.startedAt)}
                    {medication.prescribedBy && ` · ${medication.prescribedBy.name}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>

    <LabTrendList trends={brief.labTrends} />

    <div className="grid gap-6 md:grid-cols-2">
      <section aria-labelledby="care-team-heading" className="space-y-2">
        <h2 id="care-team-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" aria-hidden="true" />
          Care team
        </h2>
        {brief.careTeam.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed visits yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {brief.careTeam.map((member) => (
              <li key={member.doctor.id} className="flex justify-between gap-2">
                <span>
                  {member.doctor.name}
                  <span className="ml-2 text-muted-foreground">
                    {MEDICAL_SPECIALTY_LABELS[member.specialty]}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {member.visitCount} {member.visitCount === 1 ? 'visit' : 'visits'} · last{' '}
                  {formatClinicalDate(member.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="visits-heading" className="space-y-2 text-sm">
        <h2 id="visits-heading" className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Visits
        </h2>
        <p>
          <span className="text-muted-foreground">Last: </span>
          {brief.lastVisit ? (
            <a href={`#${recordAnchor('VISIT', brief.lastVisit.id)}`} className="hover:underline">
              {formatClinicalDate(brief.lastVisit.scheduledAt)} · {brief.lastVisit.reason} (
              {brief.lastVisit.doctor.name})
            </a>
          ) : (
            'none'
          )}
        </p>
        <p>
          <span className="text-muted-foreground">Next: </span>
          {brief.nextVisit ? (
            <a href={`#${recordAnchor('VISIT', brief.nextVisit.id)}`} className="hover:underline">
              {formatClinicalDateTime(brief.nextVisit.scheduledAt)} · {brief.nextVisit.reason} (
              {brief.nextVisit.doctor.name})
            </a>
          ) : (
            'none scheduled'
          )}
        </p>
      </section>
    </div>

    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Stethoscope className="h-3 w-3" aria-hidden="true" />
      Summary and flags only. Every item links to its source record — the clinical decision is
      yours.
    </p>
  </div>
);
