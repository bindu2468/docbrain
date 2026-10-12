import { Prisma } from '@prisma/client';
import {
  AllergyRecord,
  DiagnosisRecord,
  DoctorRef,
  LabResultRecord,
  MedicationRecord,
  PatientRecordResponse,
  TranscriptRecord,
  TreatmentRecord,
  VisitRecord,
} from '@app-starter/shared';

/**
 * Prisma rows → API records. Kept apart from the service so the brief tests
 * can build records without a database.
 */

export const DOCTOR_SELECT = { id: true, name: true, email: true } as const;

type DoctorRow = Prisma.UserGetPayload<{ select: typeof DOCTOR_SELECT }>;

/**
 * Build the nested include for a full patient record. Every child relation
 * also filters by organization, so a stray row with the wrong tenant can never
 * ride along on a correctly scoped patient.
 */
export const patientRecordInclude = (organizationId: string) =>
  ({
    visits: {
      where: { organizationId },
      include: { doctor: { select: DOCTOR_SELECT }, transcript: { select: { id: true } } },
      orderBy: { scheduledAt: 'desc' },
    },
    transcripts: { where: { organizationId }, orderBy: { recordedAt: 'desc' } },
    diagnoses: { where: { organizationId }, orderBy: { diagnosedAt: 'desc' } },
    medications: {
      where: { organizationId },
      include: { prescribedBy: { select: DOCTOR_SELECT } },
      orderBy: { startedAt: 'desc' },
    },
    allergies: { where: { organizationId }, orderBy: { severity: 'desc' } },
    labResults: { where: { organizationId }, orderBy: { collectedAt: 'desc' } },
    treatments: { where: { organizationId }, orderBy: { startedAt: 'desc' } },
  }) satisfies Prisma.PatientInclude;

export type PatientRecordRow = Prisma.PatientGetPayload<{
  include: ReturnType<typeof patientRecordInclude>;
}>;

export const toDoctorRef = (doctor: DoctorRow): DoctorRef => ({
  id: doctor.id,
  name: doctor.name ?? doctor.email,
});

/** Whole years between date of birth and `now`. */
export const ageOn = (dateOfBirth: Date, now: Date): number => {
  const hasHadBirthday =
    now.getUTCMonth() > dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      now.getUTCDate() >= dateOfBirth.getUTCDate());
  return now.getUTCFullYear() - dateOfBirth.getUTCFullYear() - (hasHadBirthday ? 0 : 1);
};

/** `@db.Date` columns carry no time of day, so send them as a plain date. */
export const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

const toVisit = (visit: PatientRecordRow['visits'][number]): VisitRecord => ({
  id: visit.id,
  patientId: visit.patientId,
  doctor: toDoctorRef(visit.doctor),
  specialty: visit.specialty,
  scheduledAt: visit.scheduledAt.toISOString(),
  status: visit.status,
  reason: visit.reason,
  notes: visit.notes,
  hasTranscript: visit.transcript !== null,
});

const toTranscript = (transcript: PatientRecordRow['transcripts'][number]): TranscriptRecord => ({
  id: transcript.id,
  visitId: transcript.visitId,
  content: transcript.content,
  recordedAt: transcript.recordedAt.toISOString(),
});

const toDiagnosis = (diagnosis: PatientRecordRow['diagnoses'][number]): DiagnosisRecord => ({
  id: diagnosis.id,
  visitId: diagnosis.visitId,
  name: diagnosis.name,
  code: diagnosis.code,
  specialty: diagnosis.specialty,
  diagnosedAt: diagnosis.diagnosedAt.toISOString(),
  resolvedAt: iso(diagnosis.resolvedAt),
});

const toMedication = (medication: PatientRecordRow['medications'][number]): MedicationRecord => ({
  id: medication.id,
  visitId: medication.visitId,
  diagnosisId: medication.diagnosisId,
  prescribedBy: medication.prescribedBy ? toDoctorRef(medication.prescribedBy) : null,
  name: medication.name,
  drugClass: medication.drugClass,
  dose: medication.dose,
  frequency: medication.frequency,
  startedAt: medication.startedAt.toISOString(),
  stoppedAt: iso(medication.stoppedAt),
  stopReason: medication.stopReason,
});

const toAllergy = (allergy: PatientRecordRow['allergies'][number]): AllergyRecord => ({
  id: allergy.id,
  substance: allergy.substance,
  reaction: allergy.reaction,
  severity: allergy.severity,
  recordedAt: allergy.recordedAt.toISOString(),
});

const toLabResult = (lab: PatientRecordRow['labResults'][number]): LabResultRecord => ({
  id: lab.id,
  visitId: lab.visitId,
  testCode: lab.testCode,
  testName: lab.testName,
  value: lab.value,
  unit: lab.unit,
  referenceLow: lab.referenceLow,
  referenceHigh: lab.referenceHigh,
  collectedAt: lab.collectedAt.toISOString(),
});

const toTreatment = (treatment: PatientRecordRow['treatments'][number]): TreatmentRecord => ({
  id: treatment.id,
  diagnosisId: treatment.diagnosisId,
  name: treatment.name,
  kind: treatment.kind,
  startedAt: treatment.startedAt.toISOString(),
  endedAt: iso(treatment.endedAt),
  notes: treatment.notes,
});

export const toPatientRecord = (row: PatientRecordRow, now: Date): PatientRecordResponse => ({
  id: row.id,
  mrn: row.mrn,
  firstName: row.firstName,
  lastName: row.lastName,
  dateOfBirth: toDateOnly(row.dateOfBirth),
  age: ageOn(row.dateOfBirth, now),
  sex: row.sex,
  phone: row.phone,
  email: row.email,
  visits: row.visits.map(toVisit),
  transcripts: row.transcripts.map(toTranscript),
  diagnoses: row.diagnoses.map(toDiagnosis),
  medications: row.medications.map(toMedication),
  allergies: row.allergies.map(toAllergy),
  labResults: row.labResults.map(toLabResult),
  treatments: row.treatments.map(toTreatment),
});
