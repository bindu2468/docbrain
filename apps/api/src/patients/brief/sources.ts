import {
  AllergyRecord,
  ClinicalSource,
  DiagnosisRecord,
  LabResultRecord,
  MEDICAL_SPECIALTY_LABELS,
  MedicationRecord,
  TranscriptRecord,
  VisitRecord,
} from '@app-starter/shared';

/**
 * Builders for the `ClinicalSource` attached to every brief item, so the UI
 * can show "where did this come from?" and link to the record.
 */

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const visitSource = (visit: VisitRecord): ClinicalSource => ({
  type: 'VISIT',
  id: visit.id,
  label: `Visit · ${MEDICAL_SPECIALTY_LABELS[visit.specialty]} · ${formatDate(visit.scheduledAt)}`,
});

export const transcriptSource = (transcript: TranscriptRecord): ClinicalSource => ({
  type: 'TRANSCRIPT',
  id: transcript.id,
  label: `Transcript · ${formatDate(transcript.recordedAt)}`,
});

export const diagnosisSource = (diagnosis: DiagnosisRecord): ClinicalSource => ({
  type: 'DIAGNOSIS',
  id: diagnosis.id,
  label: `Diagnosis · ${diagnosis.name}`,
});

export const medicationSource = (medication: MedicationRecord): ClinicalSource => ({
  type: 'MEDICATION',
  id: medication.id,
  label: `Medication · ${medication.name} · ${formatDate(medication.startedAt)}`,
});

export const allergySource = (allergy: AllergyRecord): ClinicalSource => ({
  type: 'ALLERGY',
  id: allergy.id,
  label: `Allergy · ${allergy.substance}`,
});

export const labSource = (lab: LabResultRecord): ClinicalSource => ({
  type: 'LAB_RESULT',
  id: lab.id,
  label: `Lab · ${lab.testName} · ${formatDate(lab.collectedAt)}`,
});
