import type { ReactNode } from 'react';
import { MEDICAL_SPECIALTY_LABELS, type PatientRecordResponse } from '@docbrain/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatClinicalDate, formatClinicalDateTime, recordAnchor } from '@/lib/clinical-format';

/**
 * Highlight for the record a brief source link jumped to. `target:` matches
 * the element whose id is in the URL hash, so no script is needed.
 */
const TARGET_CLASS =
  'scroll-mt-24 target:bg-amber-500/15 target:outline target:outline-2 target:outline-amber-500';

const RecordSection = ({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}) => (
  <section aria-labelledby={id} className="space-y-2">
    <h3 id={id} className="text-sm font-semibold">
      {title}
      <span className="ml-2 font-normal text-muted-foreground">{count}</span>
    </h3>
    {count === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : children}
  </section>
);

/** Every record on file, each addressable by the anchor the brief links to. */
export const PatientRecord = ({ record }: { record: PatientRecordResponse }) => (
  <div className="space-y-8">
    <RecordSection id="record-visits" title="Visits" count={record.visits.length}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Doctor</TableHead>
            <TableHead>Reason and notes</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {record.visits.map((visit) => (
            <TableRow key={visit.id} id={recordAnchor('VISIT', visit.id)} className={TARGET_CLASS}>
              <TableCell className="whitespace-nowrap">
                {formatClinicalDateTime(visit.scheduledAt)}
              </TableCell>
              <TableCell>
                {visit.doctor.name}
                <div className="text-xs text-muted-foreground">
                  {MEDICAL_SPECIALTY_LABELS[visit.specialty]}
                </div>
              </TableCell>
              <TableCell>
                {visit.reason}
                {visit.notes && <div className="text-xs text-muted-foreground">{visit.notes}</div>}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    visit.status === 'NO_SHOW' || visit.status === 'CANCELLED'
                      ? 'destructive'
                      : 'outline'
                  }
                >
                  {visit.status.replace('_', '-').toLowerCase()}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </RecordSection>

    <RecordSection id="record-transcripts" title="Transcripts" count={record.transcripts.length}>
      <ul className="space-y-3">
        {record.transcripts.map((transcript) => (
          <li
            key={transcript.id}
            id={recordAnchor('TRANSCRIPT', transcript.id)}
            className={`rounded-md border p-3 ${TARGET_CLASS}`}
          >
            <p className="mb-2 text-xs text-muted-foreground">
              {formatClinicalDateTime(transcript.recordedAt)}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{transcript.content}</p>
          </li>
        ))}
      </ul>
    </RecordSection>

    <RecordSection id="record-medications" title="Medications" count={record.medications.length}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Medication</TableHead>
            <TableHead>Prescribed by</TableHead>
            <TableHead>Dates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {record.medications.map((medication) => (
            <TableRow
              key={medication.id}
              id={recordAnchor('MEDICATION', medication.id)}
              className={TARGET_CLASS}
            >
              <TableCell>
                <span className="font-medium">{medication.name}</span> {medication.dose},{' '}
                {medication.frequency}
                {medication.drugClass && (
                  <div className="text-xs text-muted-foreground">{medication.drugClass}</div>
                )}
              </TableCell>
              <TableCell>{medication.prescribedBy?.name ?? '—'}</TableCell>
              <TableCell className="text-sm">
                {formatClinicalDate(medication.startedAt)} →{' '}
                {medication.stoppedAt ? (
                  formatClinicalDate(medication.stoppedAt)
                ) : (
                  <Badge variant="secondary">active</Badge>
                )}
                {medication.stopReason && (
                  <div className="text-xs text-muted-foreground">{medication.stopReason}</div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </RecordSection>

    <RecordSection id="record-diagnoses" title="Diagnoses" count={record.diagnoses.length}>
      <ul className="space-y-1 text-sm">
        {record.diagnoses.map((diagnosis) => (
          <li
            key={diagnosis.id}
            id={recordAnchor('DIAGNOSIS', diagnosis.id)}
            className={`rounded px-2 py-1 ${TARGET_CLASS}`}
          >
            <span className="font-medium">{diagnosis.name}</span>
            <span className="ml-2 text-muted-foreground">
              {diagnosis.code} · {formatClinicalDate(diagnosis.diagnosedAt)}
              {diagnosis.resolvedAt
                ? ` – resolved ${formatClinicalDate(diagnosis.resolvedAt)}`
                : ' · active'}
            </span>
          </li>
        ))}
      </ul>
    </RecordSection>

    <RecordSection id="record-allergies" title="Allergies" count={record.allergies.length}>
      <ul className="space-y-1 text-sm">
        {record.allergies.map((allergy) => (
          <li
            key={allergy.id}
            id={recordAnchor('ALLERGY', allergy.id)}
            className={`rounded px-2 py-1 ${TARGET_CLASS}`}
          >
            <span className="font-medium text-destructive">{allergy.substance}</span>
            <span className="ml-2">{allergy.reaction}</span>
            <span className="ml-2 text-muted-foreground">
              {allergy.severity.toLowerCase()} · recorded {formatClinicalDate(allergy.recordedAt)}
            </span>
          </li>
        ))}
      </ul>
    </RecordSection>

    <RecordSection id="record-labs" title="Lab results" count={record.labResults.length}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Collected</TableHead>
            <TableHead>Test</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Normal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {record.labResults.map((lab) => (
            <TableRow key={lab.id} id={recordAnchor('LAB_RESULT', lab.id)} className={TARGET_CLASS}>
              <TableCell className="whitespace-nowrap">
                {formatClinicalDate(lab.collectedAt)}
              </TableCell>
              <TableCell>{lab.testName}</TableCell>
              <TableCell className="text-right font-medium">
                {lab.value} {lab.unit}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {[lab.referenceLow, lab.referenceHigh].every((bound) => bound === null)
                  ? '—'
                  : `${lab.referenceLow ?? ''}–${lab.referenceHigh ?? ''}`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </RecordSection>

    <RecordSection id="record-treatments" title="Treatments" count={record.treatments.length}>
      <ul className="space-y-1 text-sm">
        {record.treatments.map((treatment) => (
          <li
            key={treatment.id}
            id={recordAnchor('TREATMENT', treatment.id)}
            className={`rounded px-2 py-1 ${TARGET_CLASS}`}
          >
            <span className="font-medium">{treatment.name}</span>
            <span className="ml-2 text-muted-foreground">
              {treatment.kind} · {formatClinicalDate(treatment.startedAt)}
              {treatment.endedAt ? ` – ${formatClinicalDate(treatment.endedAt)}` : ' · ongoing'}
            </span>
            {treatment.notes && (
              <div className="text-xs text-muted-foreground">{treatment.notes}</div>
            )}
          </li>
        ))}
      </ul>
    </RecordSection>
  </div>
);
