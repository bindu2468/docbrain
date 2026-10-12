/**
 * Synthetic clinic for the Patient Brain demo.
 *
 * Every patient here is invented. Dates are relative to the moment the seed
 * runs, so "today's schedule" always has appointments on it — re-run the seed
 * on demo day.
 *
 * Each patient is built to show something specific:
 *   Maria Gonzalez — the headline story. Rising HbA1c explained by a steroid
 *     another doctor started and a metformin she told the cardiologist she had
 *     stopped, while the med list still says active.
 *   James Carter   — penicillin allergy vs a new amoxicillin prescription, and
 *     warfarin with ibuprofen, both from a doctor outside cardiology.
 *   Robert Chen    — ACE inhibitor + spironolactone with potassium climbing,
 *     and an NSAID on top of kidney disease and heart failure.
 *   Aisha Khan     — a stable patient, so the brief also shows what "nothing to
 *     worry about" looks like.
 *
 * Idempotent: users, the clinic, and patients upsert on natural keys, and each
 * patient's history is deleted and rebuilt on every run.
 */
import {
  AllergySeverity,
  MedicalSpecialty,
  OrgRole,
  PatientSex,
  PrismaClient,
  VisitStatus,
} from '@prisma/client';

type Doctor = { id: string; specialty: MedicalSpecialty };

const DAY_MS = 24 * 60 * 60 * 1000;

/** A time `days` before now, at a given local hour. */
const daysAgo = (days: number, hour = 10, minute = 0): Date => {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setHours(hour, minute, 0, 0);
  return date;
};

const today = (hour: number, minute = 0): Date => daysAgo(0, hour, minute);
const daysAhead = (days: number, hour = 10): Date => daysAgo(-days, hour);

interface VisitSeed {
  key: string;
  doctor: Doctor;
  at: Date;
  status: VisitStatus;
  reason: string;
  notes?: string;
  transcript?: string;
}

interface DiagnosisSeed {
  key: string;
  name: string;
  code: string;
  specialty: MedicalSpecialty;
  visit?: string;
  diagnosedAt: Date;
  resolvedAt?: Date;
}

interface MedicationSeed {
  name: string;
  drugClass: string;
  dose: string;
  frequency: string;
  prescribedBy: Doctor;
  visit?: string;
  diagnosis?: string;
  startedAt: Date;
  stoppedAt?: Date;
  stopReason?: string;
}

interface LabSeed {
  code: string;
  name: string;
  unit: string;
  low?: number;
  high?: number;
  results: Array<[Date, number, string?]>; // [collectedAt, value, visit key]
}

interface PatientSeed {
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: PatientSex;
  phone: string;
  email: string;
  visits: VisitSeed[];
  diagnoses: DiagnosisSeed[];
  medications: MedicationSeed[];
  allergies: Array<{
    substance: string;
    reaction: string;
    severity: AllergySeverity;
    recordedAt: Date;
  }>;
  labs: LabSeed[];
  treatments: Array<{
    name: string;
    kind: string;
    diagnosis?: string;
    startedAt: Date;
    endedAt?: Date;
    notes?: string;
  }>;
}

const buildPatients = (
  doctors: Record<'cardio' | 'endo' | 'ortho' | 'gp', Doctor>,
): PatientSeed[] => {
  const { cardio, endo, ortho, gp } = doctors;

  return [
    {
      mrn: 'MRN-1001',
      firstName: 'Maria',
      lastName: 'Gonzalez',
      dateOfBirth: '1968-04-17',
      sex: PatientSex.FEMALE,
      phone: '+1 555 0101',
      email: 'maria.gonzalez@example.test',
      visits: [
        {
          key: 'endo-1',
          doctor: endo,
          at: daysAgo(365),
          status: VisitStatus.COMPLETED,
          reason: 'Diabetes review',
          notes: 'HbA1c 6.8%. Well controlled on metformin. Continue. Encourage walking.',
          transcript: [
            'Doctor: How have your sugars been since we last met?',
            "Patient: Pretty good. I'm taking the metformin twice a day with meals like you said.",
            'Doctor: Any stomach upset?',
            'Patient: A little at first, but it settled down.',
            'Doctor: Good. I would like you to try walking 30 minutes most days.',
            "Patient: I'll try. My knee has been bothering me, so I'll start slowly.",
          ].join('\n'),
        },
        {
          key: 'cardio-1',
          doctor: cardio,
          at: daysAgo(270),
          status: VisitStatus.COMPLETED,
          reason: 'Hypertension follow-up',
          notes: 'BP 148/92. Started atorvastatin for LDL 142. Continue lisinopril.',
        },
        {
          key: 'endo-2',
          doctor: endo,
          at: daysAgo(180),
          status: VisitStatus.COMPLETED,
          reason: 'Diabetes review',
          notes: 'HbA1c 7.4%, up from 6.8%. Reinforced diet. Recheck in 3 months.',
          transcript: [
            'Doctor: Your HbA1c has gone up a little, to 7.4.',
            "Patient: The holidays didn't help. I've been eating more sweets.",
            'Doctor: Are you still taking the metformin every day?',
            'Patient: Yes, most days.',
            "Doctor: Let's recheck in three months. If it keeps rising we'll talk about adding a second medicine.",
          ].join('\n'),
        },
        {
          key: 'cardio-2',
          doctor: cardio,
          at: daysAgo(60),
          status: VisitStatus.COMPLETED,
          reason: 'Blood pressure check',
          notes: 'BP 132/84, improved. LDL down to 96 on atorvastatin.',
          transcript: [
            'Doctor: Your blood pressure looks much better today. 132 over 84.',
            'Patient: Good. I have been careful with salt.',
            'Doctor: And the cholesterol tablet, any muscle aches?',
            'Patient: No aches. Honestly I stopped my metformin last month, it was upsetting my stomach again.',
            'Doctor: Mention that to your diabetes doctor at your next visit.',
            'Patient: I will.',
          ].join('\n'),
        },
        {
          key: 'endo-missed',
          doctor: endo,
          at: daysAgo(35),
          status: VisitStatus.NO_SHOW,
          reason: 'Diabetes review (3-month recheck)',
        },
        {
          key: 'ortho-1',
          doctor: ortho,
          at: daysAgo(21),
          status: VisitStatus.COMPLETED,
          reason: 'Right knee pain and swelling',
          notes:
            'Osteoarthritis flare, right knee. Short course of prednisone. Referred to physical therapy.',
          transcript: [
            'Doctor: How long has the knee been swollen like this?',
            'Patient: About two weeks. Stairs are really hard now.',
            "Doctor: I'm going to give you a short course of prednisone to bring the swelling down, and send you to physical therapy.",
            'Patient: Okay. Will that interfere with anything else I take?',
            'Doctor: It should be fine for a few weeks.',
          ].join('\n'),
        },
        {
          key: 'endo-today',
          doctor: endo,
          at: today(10, 30),
          status: VisitStatus.SCHEDULED,
          reason: 'Diabetes review',
        },
        {
          key: 'cardio-next',
          doctor: cardio,
          at: daysAhead(14),
          status: VisitStatus.SCHEDULED,
          reason: 'Hypertension follow-up',
        },
      ],
      diagnoses: [
        {
          key: 't2d',
          name: 'Type 2 diabetes mellitus',
          code: 'E11.9',
          specialty: MedicalSpecialty.ENDOCRINOLOGY,
          diagnosedAt: daysAgo(1100),
        },
        {
          key: 'htn',
          name: 'Essential hypertension',
          code: 'I10',
          specialty: MedicalSpecialty.CARDIOLOGY,
          diagnosedAt: daysAgo(900),
        },
        {
          key: 'lipid',
          name: 'Hyperlipidemia',
          code: 'E78.5',
          specialty: MedicalSpecialty.CARDIOLOGY,
          visit: 'cardio-1',
          diagnosedAt: daysAgo(270),
        },
        {
          key: 'knee',
          name: 'Osteoarthritis, right knee',
          code: 'M17.11',
          specialty: MedicalSpecialty.ORTHOPEDICS,
          visit: 'ortho-1',
          diagnosedAt: daysAgo(21),
        },
      ],
      medications: [
        {
          name: 'Metformin',
          drugClass: 'biguanides',
          dose: '1000 mg',
          frequency: 'twice daily',
          prescribedBy: endo,
          diagnosis: 't2d',
          startedAt: daysAgo(1100),
        },
        {
          name: 'Glipizide',
          drugClass: 'sulfonylureas',
          dose: '5 mg',
          frequency: 'once daily',
          prescribedBy: endo,
          diagnosis: 't2d',
          startedAt: daysAgo(800),
          stoppedAt: daysAgo(500),
          stopReason: 'Low blood sugar episodes with dizziness',
        },
        {
          name: 'Lisinopril',
          drugClass: 'ace inhibitors',
          dose: '10 mg',
          frequency: 'once daily',
          prescribedBy: cardio,
          diagnosis: 'htn',
          startedAt: daysAgo(900),
        },
        {
          name: 'Atorvastatin',
          drugClass: 'statins',
          dose: '20 mg',
          frequency: 'once nightly',
          prescribedBy: cardio,
          visit: 'cardio-1',
          diagnosis: 'lipid',
          startedAt: daysAgo(270),
        },
        {
          name: 'Prednisone',
          drugClass: 'corticosteroids',
          dose: '20 mg',
          frequency: 'once daily for 4 weeks',
          prescribedBy: ortho,
          visit: 'ortho-1',
          diagnosis: 'knee',
          startedAt: daysAgo(21),
        },
      ],
      allergies: [
        {
          substance: 'Penicillin',
          reaction: 'Hives and rash',
          severity: AllergySeverity.MODERATE,
          recordedAt: daysAgo(3000),
        },
        {
          substance: 'Peanuts',
          reaction: 'Throat swelling',
          severity: AllergySeverity.SEVERE,
          recordedAt: daysAgo(5000),
        },
      ],
      labs: [
        {
          code: 'HBA1C',
          name: 'HbA1c',
          unit: '%',
          high: 5.6,
          results: [
            [daysAgo(366, 8), 6.8, 'endo-1'],
            [daysAgo(181, 8), 7.4, 'endo-2'],
            [daysAgo(4, 8), 8.1],
          ],
        },
        {
          code: 'FASTING_GLUCOSE',
          name: 'Fasting glucose',
          unit: 'mg/dL',
          low: 70,
          high: 99,
          results: [
            [daysAgo(366, 8), 128, 'endo-1'],
            [daysAgo(181, 8), 141, 'endo-2'],
            [daysAgo(4, 8), 186],
          ],
        },
        {
          code: 'LDL',
          name: 'LDL cholesterol',
          unit: 'mg/dL',
          high: 100,
          results: [
            [daysAgo(271, 8), 142, 'cardio-1'],
            [daysAgo(61, 8), 96, 'cardio-2'],
          ],
        },
        {
          code: 'CREATININE',
          name: 'Creatinine',
          unit: 'mg/dL',
          low: 0.5,
          high: 1.1,
          results: [
            [daysAgo(366, 8), 0.8],
            [daysAgo(4, 8), 0.9],
          ],
        },
        {
          code: 'POTASSIUM',
          name: 'Potassium',
          unit: 'mmol/L',
          low: 3.5,
          high: 5.1,
          results: [
            [daysAgo(271, 8), 4.3],
            [daysAgo(4, 8), 4.4],
          ],
        },
      ],
      treatments: [
        {
          name: 'Physical therapy, right knee',
          kind: 'physical therapy',
          diagnosis: 'knee',
          startedAt: daysAgo(14),
          notes: 'Twice weekly for 6 weeks.',
        },
      ],
    },
    {
      mrn: 'MRN-1002',
      firstName: 'James',
      lastName: 'Carter',
      dateOfBirth: '1959-09-02',
      sex: PatientSex.MALE,
      phone: '+1 555 0102',
      email: 'james.carter@example.test',
      visits: [
        {
          key: 'cardio-1',
          doctor: cardio,
          at: daysAgo(200),
          status: VisitStatus.COMPLETED,
          reason: 'Atrial fibrillation follow-up',
          notes: 'Rate controlled. INR 2.4 on warfarin, in range. Continue.',
          transcript: [
            'Doctor: Any palpitations or bruising since we last spoke?',
            'Patient: No palpitations. A little bruising on my arms, nothing major.',
            'Doctor: Remember, no ibuprofen or aspirin with the warfarin. Paracetamol only for pain.',
            'Patient: Got it.',
          ].join('\n'),
        },
        {
          key: 'gp-1',
          doctor: gp,
          at: daysAgo(4),
          status: VisitStatus.COMPLETED,
          reason: 'Tooth pain and facial swelling',
          notes:
            'Dental abscess, lower left molar. Started amoxicillin and ibuprofen. Dental referral.',
          transcript: [
            'Doctor: That looks like an abscess. I will start you on an antibiotic and something for the pain.',
            'Patient: The pain is terrible, I have not slept in two nights.',
            'Doctor: Ibuprofen three times a day should help, plus the antibiotic.',
          ].join('\n'),
        },
        {
          key: 'cardio-today',
          doctor: cardio,
          at: today(9, 0),
          status: VisitStatus.SCHEDULED,
          reason: 'Atrial fibrillation follow-up, INR review',
        },
      ],
      diagnoses: [
        {
          key: 'afib',
          name: 'Atrial fibrillation',
          code: 'I48.91',
          specialty: MedicalSpecialty.CARDIOLOGY,
          diagnosedAt: daysAgo(1500),
        },
        {
          key: 'htn',
          name: 'Essential hypertension',
          code: 'I10',
          specialty: MedicalSpecialty.CARDIOLOGY,
          diagnosedAt: daysAgo(2000),
        },
        {
          key: 'abscess',
          name: 'Dental abscess',
          code: 'K04.7',
          specialty: MedicalSpecialty.GENERAL_PRACTICE,
          visit: 'gp-1',
          diagnosedAt: daysAgo(4),
        },
      ],
      medications: [
        {
          name: 'Warfarin',
          drugClass: 'anticoagulants',
          dose: '5 mg',
          frequency: 'once daily',
          prescribedBy: cardio,
          diagnosis: 'afib',
          startedAt: daysAgo(1500),
        },
        {
          name: 'Metoprolol',
          drugClass: 'beta blockers',
          dose: '50 mg',
          frequency: 'twice daily',
          prescribedBy: cardio,
          diagnosis: 'afib',
          startedAt: daysAgo(1500),
        },
        {
          name: 'Amoxicillin',
          drugClass: 'penicillins',
          dose: '500 mg',
          frequency: 'three times daily for 7 days',
          prescribedBy: gp,
          visit: 'gp-1',
          diagnosis: 'abscess',
          startedAt: daysAgo(4),
        },
        {
          name: 'Ibuprofen',
          drugClass: 'nsaids',
          dose: '400 mg',
          frequency: 'three times daily',
          prescribedBy: gp,
          visit: 'gp-1',
          diagnosis: 'abscess',
          startedAt: daysAgo(4),
        },
      ],
      allergies: [
        {
          substance: 'Penicillin',
          reaction: 'Anaphylaxis',
          severity: AllergySeverity.SEVERE,
          recordedAt: daysAgo(6000),
        },
      ],
      labs: [
        {
          code: 'INR',
          name: 'INR',
          unit: '',
          low: 2,
          high: 3,
          results: [
            [daysAgo(201, 8), 2.4, 'cardio-1'],
            [daysAgo(90, 8), 2.7],
            [daysAgo(2, 8), 3.6],
          ],
        },
        {
          code: 'HEMOGLOBIN',
          name: 'Hemoglobin',
          unit: 'g/dL',
          low: 13.5,
          high: 17.5,
          results: [
            [daysAgo(201, 8), 14.6],
            [daysAgo(2, 8), 13.1],
          ],
        },
        {
          code: 'CREATININE',
          name: 'Creatinine',
          unit: 'mg/dL',
          low: 0.7,
          high: 1.3,
          results: [
            [daysAgo(201, 8), 1.0],
            [daysAgo(2, 8), 1.1],
          ],
        },
      ],
      treatments: [],
    },
    {
      mrn: 'MRN-1003',
      firstName: 'Aisha',
      lastName: 'Khan',
      dateOfBirth: '1981-01-23',
      sex: PatientSex.FEMALE,
      phone: '+1 555 0103',
      email: 'aisha.khan@example.test',
      visits: [
        {
          key: 'endo-1',
          doctor: endo,
          at: daysAgo(180),
          status: VisitStatus.COMPLETED,
          reason: 'Hypothyroidism review',
          notes: 'TSH 4.1. Feeling well. Continue levothyroxine 75 mcg.',
          transcript: [
            'Doctor: How is your energy these days?',
            'Patient: Much better than last year. I am taking the levothyroxine every morning before breakfast.',
            'Doctor: Your TSH is right where we want it.',
          ].join('\n'),
        },
        {
          key: 'endo-today',
          doctor: endo,
          at: today(14, 0),
          status: VisitStatus.SCHEDULED,
          reason: 'Hypothyroidism review',
        },
      ],
      diagnoses: [
        {
          key: 'hypothyroid',
          name: 'Hypothyroidism',
          code: 'E03.9',
          specialty: MedicalSpecialty.ENDOCRINOLOGY,
          diagnosedAt: daysAgo(900),
        },
      ],
      medications: [
        {
          name: 'Levothyroxine',
          drugClass: 'thyroid hormones',
          dose: '75 mcg',
          frequency: 'once daily before breakfast',
          prescribedBy: endo,
          diagnosis: 'hypothyroid',
          startedAt: daysAgo(900),
        },
      ],
      allergies: [
        {
          substance: 'Sulfa',
          reaction: 'Mild rash',
          severity: AllergySeverity.MILD,
          recordedAt: daysAgo(4000),
        },
      ],
      labs: [
        {
          code: 'TSH',
          name: 'TSH',
          unit: 'mIU/L',
          low: 0.4,
          high: 4.5,
          results: [
            [daysAgo(540, 8), 7.9],
            [daysAgo(360, 8), 4.6],
            [daysAgo(181, 8), 4.1, 'endo-1'],
            [daysAgo(6, 8), 3.0],
          ],
        },
      ],
      treatments: [],
    },
    {
      mrn: 'MRN-1004',
      firstName: 'Robert',
      lastName: 'Chen',
      dateOfBirth: '1953-06-11',
      sex: PatientSex.MALE,
      phone: '+1 555 0104',
      email: 'robert.chen@example.test',
      visits: [
        {
          key: 'cardio-1',
          doctor: cardio,
          at: daysAgo(120),
          status: VisitStatus.COMPLETED,
          reason: 'Heart failure follow-up',
          notes:
            'Mild ankle edema. Added spironolactone 25 mg. Recheck potassium and creatinine in 4 weeks.',
          transcript: [
            'Doctor: Your ankles are a little swollen. I am adding a water tablet called spironolactone.',
            'Patient: Another pill. Okay.',
            'Doctor: We need a blood test in four weeks to check your potassium.',
          ].join('\n'),
        },
        {
          key: 'cardio-lab-missed',
          doctor: cardio,
          at: daysAgo(90),
          status: VisitStatus.CANCELLED,
          reason: 'Potassium and creatinine recheck',
        },
        {
          key: 'ortho-1',
          doctor: ortho,
          at: daysAgo(7),
          status: VisitStatus.COMPLETED,
          reason: 'Lower back pain',
          notes: 'Mechanical low back pain. Naproxen for 2 weeks. Stretching exercises.',
          transcript: [
            'Doctor: Where exactly is the pain?',
            'Patient: Lower back, after I moved some furniture.',
            'Doctor: I will give you naproxen for a couple of weeks and some stretches.',
          ].join('\n'),
        },
        {
          key: 'cardio-today',
          doctor: cardio,
          at: today(11, 0),
          status: VisitStatus.SCHEDULED,
          reason: 'Heart failure follow-up',
        },
      ],
      diagnoses: [
        {
          key: 'hf',
          name: 'Heart failure',
          code: 'I50.9',
          specialty: MedicalSpecialty.CARDIOLOGY,
          diagnosedAt: daysAgo(700),
        },
        {
          key: 'ckd',
          name: 'Chronic kidney disease, stage 3',
          code: 'N18.3',
          specialty: MedicalSpecialty.GENERAL_PRACTICE,
          diagnosedAt: daysAgo(1000),
        },
        {
          key: 'htn',
          name: 'Essential hypertension',
          code: 'I10',
          specialty: MedicalSpecialty.CARDIOLOGY,
          diagnosedAt: daysAgo(3000),
        },
        {
          key: 'back',
          name: 'Low back pain',
          code: 'M54.50',
          specialty: MedicalSpecialty.ORTHOPEDICS,
          visit: 'ortho-1',
          diagnosedAt: daysAgo(7),
        },
      ],
      medications: [
        {
          name: 'Lisinopril',
          drugClass: 'ace inhibitors',
          dose: '20 mg',
          frequency: 'once daily',
          prescribedBy: cardio,
          diagnosis: 'hf',
          startedAt: daysAgo(700),
        },
        {
          name: 'Spironolactone',
          drugClass: 'potassium-sparing diuretics',
          dose: '25 mg',
          frequency: 'once daily',
          prescribedBy: cardio,
          visit: 'cardio-1',
          diagnosis: 'hf',
          startedAt: daysAgo(120),
        },
        {
          name: 'Furosemide',
          drugClass: 'loop diuretics',
          dose: '40 mg',
          frequency: 'once daily',
          prescribedBy: cardio,
          diagnosis: 'hf',
          startedAt: daysAgo(700),
        },
        {
          name: 'Naproxen',
          drugClass: 'nsaids',
          dose: '500 mg',
          frequency: 'twice daily for 2 weeks',
          prescribedBy: ortho,
          visit: 'ortho-1',
          diagnosis: 'back',
          startedAt: daysAgo(7),
        },
      ],
      allergies: [],
      labs: [
        {
          code: 'POTASSIUM',
          name: 'Potassium',
          unit: 'mmol/L',
          low: 3.5,
          high: 5.1,
          results: [
            [daysAgo(121, 8), 4.6, 'cardio-1'],
            [daysAgo(30, 8), 5.4],
            [daysAgo(3, 8), 5.8],
          ],
        },
        {
          code: 'CREATININE',
          name: 'Creatinine',
          unit: 'mg/dL',
          low: 0.7,
          high: 1.3,
          results: [
            [daysAgo(121, 8), 1.6, 'cardio-1'],
            [daysAgo(30, 8), 1.8],
            [daysAgo(3, 8), 2.1],
          ],
        },
        {
          code: 'BNP',
          name: 'BNP',
          unit: 'pg/mL',
          high: 100,
          results: [
            [daysAgo(121, 8), 420, 'cardio-1'],
            [daysAgo(3, 8), 310],
          ],
        },
      ],
      treatments: [
        {
          name: 'Cardiac rehabilitation',
          kind: 'rehabilitation',
          diagnosis: 'hf',
          startedAt: daysAgo(650),
          endedAt: daysAgo(560),
          notes: 'Completed 12-week program.',
        },
        {
          name: 'Total knee replacement, left',
          kind: 'surgery',
          startedAt: daysAgo(2200),
          endedAt: daysAgo(2200),
          notes: 'No anesthesia complications.',
        },
      ],
    },
  ];
};

const seedPatient = async (prisma: PrismaClient, organizationId: string, seed: PatientSeed) => {
  const patient = await prisma.patient.upsert({
    where: { organizationId_mrn: { organizationId, mrn: seed.mrn } },
    update: {},
    create: {
      organizationId,
      mrn: seed.mrn,
      firstName: seed.firstName,
      lastName: seed.lastName,
      dateOfBirth: new Date(`${seed.dateOfBirth}T00:00:00Z`),
      sex: seed.sex,
      phone: seed.phone,
      email: seed.email,
    },
  });

  // Rebuild the history from scratch so relative dates move with the seed run.
  // Children of the patient cascade from these deletes.
  const scope = { organizationId, patientId: patient.id };
  await prisma.$transaction([
    prisma.medication.deleteMany({ where: scope }),
    prisma.treatment.deleteMany({ where: scope }),
    prisma.labResult.deleteMany({ where: scope }),
    prisma.diagnosis.deleteMany({ where: scope }),
    prisma.allergy.deleteMany({ where: scope }),
    prisma.transcript.deleteMany({ where: scope }),
    prisma.visit.deleteMany({ where: scope }),
  ]);

  const visitIds = new Map<string, string>();
  for (const visit of seed.visits) {
    const created = await prisma.visit.create({
      data: {
        ...scope,
        doctorId: visit.doctor.id,
        specialty: visit.doctor.specialty,
        scheduledAt: visit.at,
        status: visit.status,
        reason: visit.reason,
        notes: visit.notes ?? null,
        ...(visit.transcript
          ? {
              transcript: { create: { ...scope, content: visit.transcript, recordedAt: visit.at } },
            }
          : {}),
      },
    });
    visitIds.set(visit.key, created.id);
  }

  const visitId = (key?: string): string | null => (key ? (visitIds.get(key) ?? null) : null);

  const diagnosisIds = new Map<string, string>();
  for (const diagnosis of seed.diagnoses) {
    const created = await prisma.diagnosis.create({
      data: {
        ...scope,
        visitId: visitId(diagnosis.visit),
        name: diagnosis.name,
        code: diagnosis.code,
        specialty: diagnosis.specialty,
        diagnosedAt: diagnosis.diagnosedAt,
        resolvedAt: diagnosis.resolvedAt ?? null,
      },
    });
    diagnosisIds.set(diagnosis.key, created.id);
  }

  const diagnosisId = (key?: string): string | null =>
    key ? (diagnosisIds.get(key) ?? null) : null;

  await prisma.medication.createMany({
    data: seed.medications.map((medication) => ({
      ...scope,
      visitId: visitId(medication.visit),
      diagnosisId: diagnosisId(medication.diagnosis),
      prescribedById: medication.prescribedBy.id,
      name: medication.name,
      drugClass: medication.drugClass,
      dose: medication.dose,
      frequency: medication.frequency,
      startedAt: medication.startedAt,
      stoppedAt: medication.stoppedAt ?? null,
      stopReason: medication.stopReason ?? null,
    })),
  });

  await prisma.allergy.createMany({
    data: seed.allergies.map((allergy) => ({ ...scope, ...allergy })),
  });

  await prisma.labResult.createMany({
    data: seed.labs.flatMap((lab) =>
      lab.results.map(([collectedAt, value, visitKey]) => ({
        ...scope,
        visitId: visitId(visitKey),
        testCode: lab.code,
        testName: lab.name,
        value,
        unit: lab.unit,
        referenceLow: lab.low ?? null,
        referenceHigh: lab.high ?? null,
        collectedAt,
      })),
    ),
  });

  await prisma.treatment.createMany({
    data: seed.treatments.map((treatment) => ({
      ...scope,
      diagnosisId: diagnosisId(treatment.diagnosis),
      name: treatment.name,
      kind: treatment.kind,
      startedAt: treatment.startedAt,
      endedAt: treatment.endedAt ?? null,
      notes: treatment.notes ?? null,
    })),
  });
};

/**
 * Seed the Riverside Clinic organization and its patients. The two existing
 * demo users join as doctors in different specialties, so signing in as each
 * shows the same patient through two lenses.
 */
export const seedClinic = async (
  prisma: PrismaClient,
  passwordHash: string,
  demoUsers: { owner: { id: string }; member: { id: string } },
): Promise<void> => {
  const upsertDoctor = (email: string, name: string, username: string) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, username, password: passwordHash, emailVerifiedAt: new Date() },
    });

  const orthoUser = await upsertDoctor('ortho@example.com', 'Dr. Elena Ruiz', 'elena');
  const gpUser = await upsertDoctor('gp@example.com', 'Dr. Sam Patel', 'sam');

  const clinic = await prisma.organization.upsert({
    where: { slug: 'riverside-clinic' },
    update: {},
    create: {
      name: 'Riverside Clinic',
      slug: 'riverside-clinic',
      description: 'Synthetic clinic for the Patient Brain demo. Every patient is invented.',
      timezone: 'UTC',
    },
  });

  const memberships: Array<[string, OrgRole, MedicalSpecialty]> = [
    [demoUsers.owner.id, OrgRole.OWNER, MedicalSpecialty.CARDIOLOGY],
    [demoUsers.member.id, OrgRole.MEMBER, MedicalSpecialty.ENDOCRINOLOGY],
    [orthoUser.id, OrgRole.MEMBER, MedicalSpecialty.ORTHOPEDICS],
    [gpUser.id, OrgRole.MEMBER, MedicalSpecialty.GENERAL_PRACTICE],
  ];

  for (const [userId, role, specialty] of memberships) {
    await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId, organizationId: clinic.id } },
      update: { role, specialty },
      create: { userId, organizationId: clinic.id, role, specialty },
    });
  }

  const doctors = {
    cardio: { id: demoUsers.owner.id, specialty: MedicalSpecialty.CARDIOLOGY },
    endo: { id: demoUsers.member.id, specialty: MedicalSpecialty.ENDOCRINOLOGY },
    ortho: { id: orthoUser.id, specialty: MedicalSpecialty.ORTHOPEDICS },
    gp: { id: gpUser.id, specialty: MedicalSpecialty.GENERAL_PRACTICE },
  };

  const patients = buildPatients(doctors);
  for (const patient of patients) {
    await seedPatient(prisma, clinic.id, patient);
  }

  console.log(
    `Seeded clinic "${clinic.name}" with 4 doctors and ${patients.length} synthetic patients`,
  );
  console.log('  owner@example.com  — cardiology');
  console.log('  member@example.com — endocrinology');
  console.log('  ortho@example.com  — orthopedics');
  console.log('  gp@example.com     — general practice');
};
