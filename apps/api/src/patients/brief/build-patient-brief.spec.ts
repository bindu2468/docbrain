import { buildPatientBrief } from './build-patient-brief';
import {
  DOCTOR_A,
  DOCTOR_B,
  buildAllergy,
  buildDiagnosis,
  buildLab,
  buildMedication,
  buildRecord,
  buildVisit,
} from './test-records';

describe('buildPatientBrief', () => {
  const NOW = new Date('2026-10-12T12:00:00.000Z');

  it('returns every allergy whatever the specialty lens', () => {
    // Arrange
    const inputRecord = buildRecord({
      allergies: [buildAllergy({ id: 'a1' }), buildAllergy({ id: 'a2', substance: 'Peanuts' })],
    });

    // Act
    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: 'ORTHOPEDICS',
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    // Assert
    expect(actualBrief.allergies.map(({ id }) => id)).toEqual(['a1', 'a2']);
  });

  it('excludes stopped medications and resolved conditions', () => {
    const inputRecord = buildRecord({
      medications: [
        buildMedication({ id: 'active' }),
        buildMedication({ id: 'stopped', stoppedAt: '2026-05-01T10:00:00.000Z' }),
      ],
      diagnoses: [
        buildDiagnosis({ id: 'active' }),
        buildDiagnosis({ id: 'resolved', resolvedAt: '2026-05-01T10:00:00.000Z' }),
      ],
    });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: null,
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.currentMedications.map(({ id }) => id)).toEqual(['active']);
    expect(actualBrief.activeConditions.map(({ diagnosis }) => diagnosis.id)).toEqual(['active']);
  });

  it("measures changes from the viewer's own last visit, not a colleague's", () => {
    const inputRecord = buildRecord({
      visits: [
        buildVisit({
          id: 'theirs',
          doctor: DOCTOR_B,
          specialty: 'ORTHOPEDICS',
          scheduledAt: '2026-09-21T10:00:00.000Z',
        }),
        buildVisit({ id: 'mine', doctor: DOCTOR_A, scheduledAt: '2026-04-15T10:00:00.000Z' }),
      ],
      labResults: [
        buildLab({ id: 'before', collectedAt: '2026-01-01T08:00:00.000Z' }),
        buildLab({ id: 'after', value: 8.1, collectedAt: '2026-10-08T08:00:00.000Z' }),
      ],
    });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: 'ENDOCRINOLOGY',
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.changesSince).toBe('2026-04-15T10:00:00.000Z');
    expect(actualBrief.changes.map(({ kind }) => kind)).toEqual(['NEW_LAB', 'VISIT_ELSEWHERE']);
    expect(actualBrief.changes[0].source).toMatchObject({ type: 'LAB_RESULT', id: 'after' });
  });

  it('reports a no-show since the last visit as a missed visit', () => {
    const inputRecord = buildRecord({
      visits: [
        buildVisit({ id: 'missed', status: 'NO_SHOW', scheduledAt: '2026-09-07T10:00:00.000Z' }),
        buildVisit({ id: 'last', scheduledAt: '2026-04-15T10:00:00.000Z' }),
      ],
    });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: null,
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.changes).toHaveLength(1);
    expect(actualBrief.changes[0]).toMatchObject({
      kind: 'MISSED_VISIT',
      source: { id: 'missed' },
    });
  });

  it('reports no changes for a patient with no completed visit', () => {
    const inputRecord = buildRecord({ labResults: [buildLab()] });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: null,
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.changesSince).toBeNull();
    expect(actualBrief.changes).toEqual([]);
  });

  it('puts HIGH severity flags before MEDIUM ones', () => {
    const inputRecord = buildRecord({
      allergies: [buildAllergy()],
      diagnoses: [buildDiagnosis()],
      medications: [
        buildMedication({ id: 'pred', name: 'Prednisone', drugClass: 'corticosteroids' }),
        buildMedication({ id: 'amox', name: 'Amoxicillin', drugClass: 'penicillins' }),
      ],
    });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: null,
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.safetyFlags.map(({ severity }) => severity)).toEqual(['HIGH', 'MEDIUM']);
  });

  it('marks conditions outside the specialty as not relevant and sorts them last', () => {
    const inputRecord = buildRecord({
      diagnoses: [
        buildDiagnosis({ id: 'knee', specialty: 'ORTHOPEDICS' }),
        buildDiagnosis({ id: 'diabetes', specialty: 'ENDOCRINOLOGY' }),
      ],
    });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: 'ENDOCRINOLOGY',
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.activeConditions).toEqual([
      expect.objectContaining({
        isRelevant: true,
        diagnosis: expect.objectContaining({ id: 'diabetes' }),
      }),
      expect.objectContaining({
        isRelevant: false,
        diagnosis: expect.objectContaining({ id: 'knee' }),
      }),
    ]);
  });

  it('counts visits per doctor in the care team', () => {
    const inputRecord = buildRecord({
      visits: [
        buildVisit({
          id: 'v3',
          doctor: DOCTOR_B,
          specialty: 'CARDIOLOGY',
          scheduledAt: '2026-08-01T10:00:00.000Z',
        }),
        buildVisit({ id: 'v2', scheduledAt: '2026-04-01T10:00:00.000Z' }),
        buildVisit({ id: 'v1', scheduledAt: '2026-01-01T10:00:00.000Z' }),
      ],
    });

    const actualBrief = buildPatientBrief(inputRecord, {
      specialty: null,
      viewerId: DOCTOR_A.id,
      now: NOW,
    });

    expect(actualBrief.careTeam).toEqual([
      {
        doctor: DOCTOR_B,
        specialty: 'CARDIOLOGY',
        lastSeenAt: '2026-08-01T10:00:00.000Z',
        visitCount: 1,
      },
      {
        doctor: DOCTOR_A,
        specialty: 'ENDOCRINOLOGY',
        lastSeenAt: '2026-04-01T10:00:00.000Z',
        visitCount: 2,
      },
    ]);
  });
});
