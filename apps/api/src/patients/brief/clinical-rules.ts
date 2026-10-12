import {
  AllergyRecord,
  DiagnosisRecord,
  LabResultRecord,
  LabTrend,
  LabTrendDirection,
  MedicalSpecialty,
  MedicationRecord,
  SafetyFlag,
  SafetyFlagSeverity,
  TranscriptRecord,
} from '@app-starter/shared';
import { allergySource, diagnosisSource, medicationSource, transcriptSource } from './sources';

/**
 * Hand-written clinical rules behind the brief's safety flags.
 *
 * These are deliberately a small, fixed table rather than model output: a
 * flag a doctor acts on has to be reproducible and testable, and an invented
 * interaction is worse than a missing one. The tables cover the demo data and
 * the most common cases — they are not a drug-interaction database, and the UI
 * says so.
 */

interface AllergyRule {
  readonly drugClass: string;
  readonly severity: SafetyFlagSeverity;
  readonly note: string;
}

/** Allergy substance (lower case) → drug classes that cross-react with it. */
const ALLERGY_CROSS_REACTIVITY: Readonly<Record<string, readonly AllergyRule[]>> = {
  penicillin: [
    { drugClass: 'penicillins', severity: 'HIGH', note: 'is a penicillin' },
    {
      drugClass: 'cephalosporins',
      severity: 'MEDIUM',
      note: 'is a cephalosporin, which has a small cross-reactivity risk with penicillin',
    },
  ],
  sulfa: [{ drugClass: 'sulfonamides', severity: 'HIGH', note: 'is a sulfonamide' }],
  aspirin: [
    { drugClass: 'salicylates', severity: 'HIGH', note: 'is a salicylate' },
    {
      drugClass: 'nsaids',
      severity: 'MEDIUM',
      note: 'is an NSAID, which can cross-react with aspirin',
    },
  ],
} as const;

interface InteractionRule {
  readonly classes: readonly [string, string];
  readonly severity: SafetyFlagSeverity;
  readonly effect: string;
}

const DRUG_INTERACTIONS: readonly InteractionRule[] = [
  {
    classes: ['anticoagulants', 'nsaids'],
    severity: 'HIGH',
    effect: 'raises bleeding risk',
  },
  {
    classes: ['anticoagulants', 'salicylates'],
    severity: 'HIGH',
    effect: 'raises bleeding risk',
  },
  {
    classes: ['ace inhibitors', 'potassium-sparing diuretics'],
    severity: 'HIGH',
    effect: 'can cause dangerously high potassium',
  },
  {
    classes: ['ace inhibitors', 'nsaids'],
    severity: 'MEDIUM',
    effect: 'can reduce kidney function and blunt blood-pressure control',
  },
  {
    classes: ['ssris', 'nsaids'],
    severity: 'MEDIUM',
    effect: 'raises gastrointestinal bleeding risk',
  },
  {
    classes: ['statins', 'macrolides'],
    severity: 'MEDIUM',
    effect: 'raises the risk of muscle damage',
  },
] as const;

interface DrugConditionRule {
  readonly drugClass: string;
  /** ICD-10 code prefix the condition is matched on */
  readonly codePrefix: string;
  readonly severity: SafetyFlagSeverity;
  readonly effect: string;
}

const DRUG_CONDITION_RULES: readonly DrugConditionRule[] = [
  {
    drugClass: 'corticosteroids',
    codePrefix: 'E11',
    severity: 'MEDIUM',
    effect: 'can raise blood glucose',
  },
  {
    drugClass: 'thiazide diuretics',
    codePrefix: 'E11',
    severity: 'MEDIUM',
    effect: 'can raise blood glucose',
  },
  {
    drugClass: 'beta blockers',
    codePrefix: 'E11',
    severity: 'MEDIUM',
    effect: 'can mask the warning signs of low blood sugar',
  },
  {
    drugClass: 'nsaids',
    codePrefix: 'N18',
    severity: 'HIGH',
    effect: 'can worsen kidney function',
  },
  {
    drugClass: 'nsaids',
    codePrefix: 'I50',
    severity: 'HIGH',
    effect: 'can cause fluid retention and worsen heart failure',
  },
  {
    drugClass: 'nsaids',
    codePrefix: 'I10',
    severity: 'MEDIUM',
    effect: 'can raise blood pressure',
  },
] as const;

/**
 * Lab tests each specialty reads first. GENERAL_PRACTICE is absent on purpose:
 * a GP's brief treats every test as relevant.
 */
const SPECIALTY_LAB_CODES: Readonly<Partial<Record<MedicalSpecialty, readonly string[]>>> = {
  CARDIOLOGY: ['LDL', 'HDL', 'TRIGLYCERIDES', 'POTASSIUM', 'INR', 'TROPONIN', 'BNP', 'CREATININE'],
  ENDOCRINOLOGY: ['HBA1C', 'FASTING_GLUCOSE', 'TSH', 'CREATININE', 'LDL'],
  ORTHOPEDICS: ['VITAMIN_D', 'HEMOGLOBIN', 'INR', 'CRP'],
  EMERGENCY: ['POTASSIUM', 'CREATININE', 'HEMOGLOBIN', 'INR', 'TROPONIN'],
} as const;

/** Phrases that mean the patient is no longer taking something. */
const STOPPED_TAKING_PATTERN =
  /\b(stopped|stop taking|quit|not taking|ran out|haven't been taking|havent been taking|no longer taking|gave up)\b/i;

/** A relative change smaller than this between first and last point is "stable". */
const TREND_THRESHOLD = 0.05;

const normalize = (value: string | null): string => (value ?? '').trim().toLowerCase();

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const prescriberSuffix = (medication: MedicationRecord): string =>
  medication.prescribedBy
    ? `, prescribed by ${medication.prescribedBy.name} on ${formatDate(medication.startedAt)}`
    : '';

export const isLabRelevant = (testCode: string, specialty: MedicalSpecialty | null): boolean => {
  if (specialty === null) return true;
  const codes = SPECIALTY_LAB_CODES[specialty];
  return codes === undefined || codes.includes(testCode);
};

export const findAllergyConflicts = (
  allergies: readonly AllergyRecord[],
  medications: readonly MedicationRecord[],
): SafetyFlag[] =>
  allergies.flatMap((allergy) => {
    const substance = normalize(allergy.substance);
    const rules = ALLERGY_CROSS_REACTIVITY[substance] ?? [];

    return medications.flatMap((medication): SafetyFlag[] => {
      const isNamedMatch = normalize(medication.name).includes(substance);
      const rule = rules.find(
        (candidate) => candidate.drugClass === normalize(medication.drugClass),
      );

      if (!isNamedMatch && !rule) return [];

      const note = rule?.note ?? `contains ${allergy.substance.toLowerCase()}`;
      return [
        {
          kind: 'ALLERGY_CONFLICT',
          severity: rule?.severity ?? 'HIGH',
          message: `Allergic to ${allergy.substance} (${allergy.reaction}), and ${medication.name} ${note}${prescriberSuffix(medication)}.`,
          sources: [allergySource(allergy), medicationSource(medication)],
        },
      ];
    });
  });

export const findDrugInteractions = (medications: readonly MedicationRecord[]): SafetyFlag[] => {
  const flags: SafetyFlag[] = [];

  medications.forEach((first, index) => {
    medications.slice(index + 1).forEach((second) => {
      const pair = [normalize(first.drugClass), normalize(second.drugClass)];
      const rule = DRUG_INTERACTIONS.find(
        ({ classes }) =>
          pair.includes(classes[0]) && pair.includes(classes[1]) && pair[0] !== pair[1],
      );

      if (!rule) return;

      flags.push({
        kind: 'DRUG_INTERACTION',
        severity: rule.severity,
        message: `${first.name} with ${second.name} ${rule.effect}.`,
        sources: [medicationSource(first), medicationSource(second)],
      });
    });
  });

  return flags;
};

export const findDrugConditionConflicts = (
  medications: readonly MedicationRecord[],
  conditions: readonly DiagnosisRecord[],
): SafetyFlag[] =>
  medications.flatMap((medication) =>
    conditions.flatMap((condition): SafetyFlag[] => {
      const rule = DRUG_CONDITION_RULES.find(
        ({ drugClass, codePrefix }) =>
          drugClass === normalize(medication.drugClass) &&
          (condition.code ?? '').startsWith(codePrefix),
      );

      if (!rule) return [];

      return [
        {
          kind: 'DRUG_CONDITION',
          severity: rule.severity,
          message: `${medication.name} (${medication.drugClass})${prescriberSuffix(medication)} ${rule.effect} — patient has ${condition.name}.`,
          sources: [medicationSource(medication), diagnosisSource(condition)],
        },
      ];
    }),
  );

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/**
 * Flag a medication still listed as active when a later transcript has the
 * patient saying they stopped it. Only the patient's own lines are read, so a
 * doctor saying "don't stop your metformin" does not trigger it.
 */
export const findContradictions = (
  activeMedications: readonly MedicationRecord[],
  transcripts: readonly TranscriptRecord[],
): SafetyFlag[] =>
  activeMedications.flatMap((medication) => {
    const name = normalize(medication.name);

    for (const transcript of transcripts) {
      if (transcript.recordedAt <= medication.startedAt) continue;

      const patientLines = transcript.content
        .split('\n')
        .filter((line) => /^\s*patient\s*:/i.test(line))
        .join('\n');

      const sentence = splitSentences(patientLines).find(
        (candidate) =>
          candidate.toLowerCase().includes(name) && STOPPED_TAKING_PATTERN.test(candidate),
      );

      if (sentence) {
        const quote = sentence.replace(/^\s*patient\s*:\s*/i, '');
        return [
          {
            kind: 'CONTRADICTION' as const,
            severity: 'MEDIUM' as const,
            message: `On ${formatDate(transcript.recordedAt)} the patient said “${quote}”, but ${medication.name} is still listed as active.`,
            sources: [transcriptSource(transcript), medicationSource(medication)],
          },
        ];
      }
    }

    return [];
  });

const trendDirection = (values: readonly number[]): LabTrendDirection => {
  if (values.length < 2) return 'STABLE';

  const first = values[0];
  const last = values[values.length - 1];
  const change = first === 0 ? last - first : (last - first) / Math.abs(first);

  if (change > TREND_THRESHOLD) return 'RISING';
  if (change < -TREND_THRESHOLD) return 'FALLING';
  return 'STABLE';
};

const isOutOfRange = (lab: LabResultRecord): boolean =>
  (lab.referenceLow !== null && lab.value < lab.referenceLow) ||
  (lab.referenceHigh !== null && lab.value > lab.referenceHigh);

/**
 * Group lab results into one oldest-first series per test. Out-of-range
 * results sort first whatever the specialty — the lens may reorder what is
 * normal, but must never bury an abnormal value — then relevant tests.
 */
export const buildLabTrends = (
  labResults: readonly LabResultRecord[],
  specialty: MedicalSpecialty | null,
): LabTrend[] => {
  const byCode = new Map<string, LabResultRecord[]>();

  for (const lab of labResults) {
    byCode.set(lab.testCode, [...(byCode.get(lab.testCode) ?? []), lab]);
  }

  const trends = [...byCode.values()].map((series): LabTrend => {
    const ordered = [...series].sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
    const latest = ordered[ordered.length - 1];

    return {
      testCode: latest.testCode,
      testName: latest.testName,
      unit: latest.unit,
      referenceLow: latest.referenceLow,
      referenceHigh: latest.referenceHigh,
      points: ordered.map(({ id, value, collectedAt }) => ({ id, value, collectedAt })),
      direction: trendDirection(ordered.map(({ value }) => value)),
      isLatestOutOfRange: isOutOfRange(latest),
      isRelevant: isLabRelevant(latest.testCode, specialty),
    };
  });

  return trends.sort(
    (a, b) =>
      Number(b.isLatestOutOfRange) - Number(a.isLatestOutOfRange) ||
      Number(b.isRelevant) - Number(a.isRelevant) ||
      a.testName.localeCompare(b.testName),
  );
};
