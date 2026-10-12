import {
  BriefChange,
  CareTeamMember,
  MEDICAL_SPECIALTY_LABELS,
  MedicalSpecialty,
  PatientBriefResponse,
  PatientRecordResponse,
  SafetyFlag,
  VisitRecord,
} from '@app-starter/shared';
import {
  buildLabTrends,
  findAllergyConflicts,
  findContradictions,
  findDrugConditionConflicts,
  findDrugInteractions,
} from './clinical-rules';
import { diagnosisSource, labSource, medicationSource, visitSource } from './sources';

export interface BuildBriefOptions {
  /** The lens the brief is built for; null means "show everything equally" */
  specialty: MedicalSpecialty | null;
  /** The doctor reading the brief — "changes" are measured from their last visit */
  viewerId: string;
  now: Date;
}

const byNewest = (a: string, b: string): number => b.localeCompare(a);

/**
 * The visit "what changed" is measured from: the viewer's own last completed
 * visit with this patient, falling back to the patient's last visit with
 * anyone. A doctor cares what happened since *they* last saw the patient.
 */
const findBaselineVisit = (
  completedVisits: readonly VisitRecord[],
  viewerId: string,
): VisitRecord | null =>
  completedVisits.find((visit) => visit.doctor.id === viewerId) ?? completedVisits[0] ?? null;

const collectChanges = (
  record: PatientRecordResponse,
  baseline: VisitRecord,
  viewerId: string,
  nowIso: string,
): BriefChange[] => {
  const since = baseline.scheduledAt;
  const isInWindow = (iso: string | null): iso is string =>
    iso !== null && iso > since && iso <= nowIso;

  const labs = record.labResults
    .filter((lab) => isInWindow(lab.collectedAt))
    .map(
      (lab): BriefChange => ({
        kind: 'NEW_LAB',
        occurredAt: lab.collectedAt,
        message: `New ${lab.testName}: ${lab.value} ${lab.unit}`,
        source: labSource(lab),
      }),
    );

  const started = record.medications
    .filter((medication) => isInWindow(medication.startedAt))
    .map(
      (medication): BriefChange => ({
        kind: 'MEDICATION_STARTED',
        occurredAt: medication.startedAt,
        message: `Started ${medication.name} ${medication.dose}${
          medication.prescribedBy ? ` (${medication.prescribedBy.name})` : ''
        }`,
        source: medicationSource(medication),
      }),
    );

  const stopped = record.medications
    .filter((medication) => isInWindow(medication.stoppedAt))
    .map(
      (medication): BriefChange => ({
        kind: 'MEDICATION_STOPPED',
        // isInWindow narrowed stoppedAt above, but not through the filter
        occurredAt: medication.stoppedAt ?? medication.startedAt,
        message: `Stopped ${medication.name}${medication.stopReason ? `: ${medication.stopReason}` : ''}`,
        source: medicationSource(medication),
      }),
    );

  const diagnoses = record.diagnoses
    .filter((diagnosis) => isInWindow(diagnosis.diagnosedAt))
    .map(
      (diagnosis): BriefChange => ({
        kind: 'NEW_DIAGNOSIS',
        occurredAt: diagnosis.diagnosedAt,
        message: `New diagnosis: ${diagnosis.name}`,
        source: diagnosisSource(diagnosis),
      }),
    );

  const visits = record.visits
    .filter((visit) => isInWindow(visit.scheduledAt) && visit.id !== baseline.id)
    .flatMap((visit): BriefChange[] => {
      if (visit.status === 'CANCELLED' || visit.status === 'NO_SHOW') {
        return [
          {
            kind: 'MISSED_VISIT',
            occurredAt: visit.scheduledAt,
            message: `Missed ${MEDICAL_SPECIALTY_LABELS[visit.specialty].toLowerCase()} visit (${
              visit.status === 'NO_SHOW' ? 'no-show' : 'cancelled'
            })`,
            source: visitSource(visit),
          },
        ];
      }

      if (visit.status === 'COMPLETED' && visit.doctor.id !== viewerId) {
        return [
          {
            kind: 'VISIT_ELSEWHERE',
            occurredAt: visit.scheduledAt,
            message: `Seen by ${visit.doctor.name} (${MEDICAL_SPECIALTY_LABELS[visit.specialty]}): ${visit.reason}`,
            source: visitSource(visit),
          },
        ];
      }

      return [];
    });

  return [...labs, ...started, ...stopped, ...diagnoses, ...visits].sort((a, b) =>
    byNewest(a.occurredAt, b.occurredAt),
  );
};

const buildCareTeam = (completedVisits: readonly VisitRecord[]): CareTeamMember[] => {
  const byDoctor = new Map<string, CareTeamMember>();

  // Visits arrive newest first, so the first one seen per doctor is the latest
  for (const visit of completedVisits) {
    const existing = byDoctor.get(visit.doctor.id);
    byDoctor.set(
      visit.doctor.id,
      existing
        ? { ...existing, visitCount: existing.visitCount + 1 }
        : {
            doctor: visit.doctor,
            specialty: visit.specialty,
            lastSeenAt: visit.scheduledAt,
            visitCount: 1,
          },
    );
  }

  return [...byDoctor.values()];
};

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1 } as const;

const startOfDay = (date: Date): string => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
};

/**
 * Build the pre-visit brief from a patient's full record.
 *
 * Pure and deterministic: everything here is computed from the records, with
 * no model in the loop, so the same record always yields the same brief.
 * Allergies are passed through unfiltered — the specialty lens reorders and
 * highlights, it never hides.
 */
export const buildPatientBrief = (
  record: PatientRecordResponse,
  { specialty, viewerId, now }: BuildBriefOptions,
): PatientBriefResponse => {
  const nowIso = now.toISOString();

  const activeDiagnoses = record.diagnoses.filter((diagnosis) => diagnosis.resolvedAt === null);
  const currentMedications = record.medications
    .filter((medication) => medication.stoppedAt === null && medication.startedAt <= nowIso)
    .sort((a, b) => byNewest(a.startedAt, b.startedAt));

  const completedVisits = record.visits
    .filter((visit) => visit.status === 'COMPLETED' && visit.scheduledAt <= nowIso)
    .sort((a, b) => byNewest(a.scheduledAt, b.scheduledAt));

  const nextVisit =
    record.visits
      .filter((visit) => visit.status === 'SCHEDULED' && visit.scheduledAt >= startOfDay(now))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null;

  const baseline = findBaselineVisit(completedVisits, viewerId);

  const safetyFlags: SafetyFlag[] = [
    ...findAllergyConflicts(record.allergies, currentMedications),
    ...findDrugInteractions(currentMedications),
    ...findDrugConditionConflicts(currentMedications, activeDiagnoses),
    ...findContradictions(currentMedications, record.transcripts),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    patient: {
      id: record.id,
      mrn: record.mrn,
      firstName: record.firstName,
      lastName: record.lastName,
      dateOfBirth: record.dateOfBirth,
      age: record.age,
      sex: record.sex,
    },
    specialty,
    generatedAt: nowIso,
    allergies: record.allergies,
    safetyFlags,
    activeConditions: activeDiagnoses
      .map((diagnosis) => ({
        diagnosis,
        isRelevant: specialty === null || diagnosis.specialty === specialty,
      }))
      .sort((a, b) => Number(b.isRelevant) - Number(a.isRelevant)),
    currentMedications,
    labTrends: buildLabTrends(record.labResults, specialty),
    lastVisit: completedVisits[0] ?? null,
    nextVisit,
    changesSince: baseline?.scheduledAt ?? null,
    changes: baseline ? collectChanges(record, baseline, viewerId, nowIso) : [],
    careTeam: buildCareTeam(completedVisits),
  };
};
