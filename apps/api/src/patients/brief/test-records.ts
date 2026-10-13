import {
  AllergyRecord,
  DiagnosisRecord,
  LabResultRecord,
  MedicationRecord,
  PatientRecordResponse,
  TranscriptRecord,
  VisitRecord,
} from '@docbrain/shared';

/** Builders for brief tests. Each returns a valid record; override what matters. */

export const DOCTOR_A = { id: 'doctor-a', name: 'Dr. A' };
export const DOCTOR_B = { id: 'doctor-b', name: 'Dr. B' };

export const buildMedication = (overrides: Partial<MedicationRecord> = {}): MedicationRecord => ({
  id: 'med-1',
  visitId: null,
  diagnosisId: null,
  prescribedBy: DOCTOR_A,
  name: 'Metformin',
  drugClass: 'biguanides',
  dose: '1000 mg',
  frequency: 'twice daily',
  startedAt: '2026-01-01T10:00:00.000Z',
  stoppedAt: null,
  stopReason: null,
  ...overrides,
});

export const buildAllergy = (overrides: Partial<AllergyRecord> = {}): AllergyRecord => ({
  id: 'allergy-1',
  substance: 'Penicillin',
  reaction: 'Anaphylaxis',
  severity: 'SEVERE',
  recordedAt: '2020-01-01T10:00:00.000Z',
  ...overrides,
});

export const buildDiagnosis = (overrides: Partial<DiagnosisRecord> = {}): DiagnosisRecord => ({
  id: 'dx-1',
  visitId: null,
  name: 'Type 2 diabetes mellitus',
  code: 'E11.9',
  specialty: 'ENDOCRINOLOGY',
  diagnosedAt: '2025-01-01T10:00:00.000Z',
  resolvedAt: null,
  ...overrides,
});

export const buildTranscript = (overrides: Partial<TranscriptRecord> = {}): TranscriptRecord => ({
  id: 'transcript-1',
  visitId: 'visit-1',
  content: 'Doctor: How are you?\nPatient: Fine.',
  recordedAt: '2026-06-01T10:00:00.000Z',
  ...overrides,
});

export const buildLab = (overrides: Partial<LabResultRecord> = {}): LabResultRecord => ({
  id: 'lab-1',
  visitId: null,
  testCode: 'HBA1C',
  testName: 'HbA1c',
  value: 6.8,
  unit: '%',
  referenceLow: null,
  referenceHigh: 5.6,
  collectedAt: '2026-01-01T08:00:00.000Z',
  ...overrides,
});

export const buildVisit = (overrides: Partial<VisitRecord> = {}): VisitRecord => ({
  id: 'visit-1',
  patientId: 'patient-1',
  doctor: DOCTOR_A,
  specialty: 'ENDOCRINOLOGY',
  scheduledAt: '2026-01-01T10:00:00.000Z',
  status: 'COMPLETED',
  reason: 'Diabetes review',
  notes: null,
  hasTranscript: false,
  ...overrides,
});

export const buildRecord = (
  overrides: Partial<PatientRecordResponse> = {},
): PatientRecordResponse => ({
  id: 'patient-1',
  mrn: 'MRN-1',
  firstName: 'Maria',
  lastName: 'Gonzalez',
  dateOfBirth: '1968-04-17',
  age: 58,
  sex: 'FEMALE',
  phone: null,
  email: null,
  visits: [],
  transcripts: [],
  diagnoses: [],
  medications: [],
  allergies: [],
  labResults: [],
  treatments: [],
  ...overrides,
});
