/**
 * Patient Brain types shared by the API and the web app.
 *
 * Enums are string unions rather than TypeScript enums so that the Prisma
 * enums (also string unions) assign to them without casts.
 * Dates are ISO strings in JSON responses.
 */

export const MEDICAL_SPECIALTIES = [
  'GENERAL_PRACTICE',
  'CARDIOLOGY',
  'ENDOCRINOLOGY',
  'ORTHOPEDICS',
  'EMERGENCY',
] as const;

export type MedicalSpecialty = (typeof MEDICAL_SPECIALTIES)[number];

export const MEDICAL_SPECIALTY_LABELS: Readonly<Record<MedicalSpecialty, string>> = {
  GENERAL_PRACTICE: 'General practice',
  CARDIOLOGY: 'Cardiology',
  ENDOCRINOLOGY: 'Endocrinology',
  ORTHOPEDICS: 'Orthopedics',
  EMERGENCY: 'Emergency',
};

export type PatientSex = 'FEMALE' | 'MALE' | 'OTHER';
export type VisitStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AllergySeverity = 'MILD' | 'MODERATE' | 'SEVERE';

/** The kind of record a brief item was derived from. Used to link back to it. */
export type ClinicalSourceType =
  | 'VISIT'
  | 'TRANSCRIPT'
  | 'DIAGNOSIS'
  | 'MEDICATION'
  | 'ALLERGY'
  | 'LAB_RESULT'
  | 'TREATMENT';

/**
 * A pointer to the record a fact came from. The patient page renders every
 * record with the anchor `${type}-${id}` so a source can be scrolled to.
 */
export interface ClinicalSource {
  type: ClinicalSourceType;
  id: string;
  /** Short human label, e.g. "Lab · HbA1c · 3 Mar 2026" */
  label: string;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface PatientSummary {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: number;
  sex: PatientSex;
  allergyCount: number;
  nextVisitAt: string | null;
}

export interface PatientListResponse {
  items: PatientSummary[];
  total: number;
}

export interface DoctorRef {
  id: string;
  name: string;
}

export interface VisitRecord {
  id: string;
  patientId: string;
  doctor: DoctorRef;
  specialty: MedicalSpecialty;
  scheduledAt: string;
  status: VisitStatus;
  reason: string;
  notes: string | null;
  hasTranscript: boolean;
}

export interface TranscriptRecord {
  id: string;
  visitId: string;
  content: string;
  recordedAt: string;
}

export interface DiagnosisRecord {
  id: string;
  visitId: string | null;
  name: string;
  code: string | null;
  specialty: MedicalSpecialty | null;
  diagnosedAt: string;
  resolvedAt: string | null;
}

export interface MedicationRecord {
  id: string;
  visitId: string | null;
  diagnosisId: string | null;
  prescribedBy: DoctorRef | null;
  name: string;
  drugClass: string | null;
  dose: string;
  frequency: string;
  startedAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
}

export interface AllergyRecord {
  id: string;
  substance: string;
  reaction: string;
  severity: AllergySeverity;
  recordedAt: string;
}

export interface LabResultRecord {
  id: string;
  visitId: string | null;
  testCode: string;
  testName: string;
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  collectedAt: string;
}

export interface TreatmentRecord {
  id: string;
  diagnosisId: string | null;
  name: string;
  kind: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

/** A patient with their complete history, newest first in every list. */
export interface PatientRecordResponse {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: number;
  sex: PatientSex;
  phone: string | null;
  email: string | null;
  visits: VisitRecord[];
  transcripts: TranscriptRecord[];
  diagnoses: DiagnosisRecord[];
  medications: MedicationRecord[];
  allergies: AllergyRecord[];
  labResults: LabResultRecord[];
  treatments: TreatmentRecord[];
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ScheduleItem {
  visitId: string;
  scheduledAt: string;
  status: VisitStatus;
  reason: string;
  specialty: MedicalSpecialty;
  doctor: DoctorRef;
  patient: Pick<PatientSummary, 'id' | 'firstName' | 'lastName' | 'age' | 'sex' | 'allergyCount'>;
}

export interface ScheduleResponse {
  items: ScheduleItem[];
}

// ---------------------------------------------------------------------------
// Pre-visit brief
// ---------------------------------------------------------------------------

export type SafetyFlagKind =
  | 'ALLERGY_CONFLICT'
  | 'DRUG_INTERACTION'
  | 'DRUG_CONDITION'
  | 'CONTRADICTION';
export type SafetyFlagSeverity = 'HIGH' | 'MEDIUM';

/**
 * A rule-based warning. Flags come from a fixed, hand-written rule table, not
 * from a model, so they are only as complete as that table.
 */
export interface SafetyFlag {
  kind: SafetyFlagKind;
  severity: SafetyFlagSeverity;
  message: string;
  sources: ClinicalSource[];
}

export type LabTrendDirection = 'RISING' | 'FALLING' | 'STABLE';

export interface LabTrend {
  testCode: string;
  testName: string;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  points: Array<{ id: string; value: number; collectedAt: string }>;
  direction: LabTrendDirection;
  isLatestOutOfRange: boolean;
  /** Whether this test matters to the specialty the brief was built for */
  isRelevant: boolean;
}

export interface BriefCondition {
  diagnosis: DiagnosisRecord;
  isRelevant: boolean;
}

export type ChangeKind =
  | 'NEW_LAB'
  | 'MEDICATION_STARTED'
  | 'MEDICATION_STOPPED'
  | 'NEW_DIAGNOSIS'
  | 'VISIT_ELSEWHERE'
  | 'MISSED_VISIT';

export interface BriefChange {
  kind: ChangeKind;
  occurredAt: string;
  message: string;
  source: ClinicalSource;
}

export interface CareTeamMember {
  doctor: DoctorRef;
  specialty: MedicalSpecialty;
  lastSeenAt: string;
  visitCount: number;
}

export interface PatientBriefResponse {
  patient: Pick<
    PatientRecordResponse,
    'id' | 'mrn' | 'firstName' | 'lastName' | 'dateOfBirth' | 'age' | 'sex'
  >;
  specialty: MedicalSpecialty | null;
  generatedAt: string;
  /** Always every allergy, regardless of specialty. Never filtered. */
  allergies: AllergyRecord[];
  safetyFlags: SafetyFlag[];
  activeConditions: BriefCondition[];
  currentMedications: MedicationRecord[];
  labTrends: LabTrend[];
  lastVisit: VisitRecord | null;
  nextVisit: VisitRecord | null;
  /** The visit the "changes" are measured from, if there is one */
  changesSince: string | null;
  changes: BriefChange[];
  careTeam: CareTeamMember[];
}

// ---------------------------------------------------------------------------
// Clinician profile
// ---------------------------------------------------------------------------

export interface ClinicianProfileResponse {
  userId: string;
  name: string;
  specialty: MedicalSpecialty | null;
}

export interface UpdateClinicianProfileRequest {
  specialty: MedicalSpecialty | null;
}
