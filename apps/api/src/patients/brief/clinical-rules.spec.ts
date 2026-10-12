import {
  buildLabTrends,
  findAllergyConflicts,
  findContradictions,
  findDrugConditionConflicts,
  findDrugInteractions,
} from './clinical-rules';
import {
  buildAllergy,
  buildDiagnosis,
  buildLab,
  buildMedication,
  buildTranscript,
} from './test-records';

describe('clinical rules', () => {
  describe('findAllergyConflicts', () => {
    it('flags a penicillin-class drug for a patient allergic to penicillin', () => {
      // Arrange
      const inputAllergies = [buildAllergy({ substance: 'Penicillin' })];
      const inputMedications = [
        buildMedication({ id: 'amox', name: 'Amoxicillin', drugClass: 'penicillins' }),
      ];

      // Act
      const actualFlags = findAllergyConflicts(inputAllergies, inputMedications);

      // Assert
      expect(actualFlags).toHaveLength(1);
      expect(actualFlags[0]).toMatchObject({ kind: 'ALLERGY_CONFLICT', severity: 'HIGH' });
      expect(actualFlags[0].message).toContain('Amoxicillin is a penicillin');
      expect(actualFlags[0].sources.map(({ type }) => type)).toEqual(['ALLERGY', 'MEDICATION']);
    });

    it('rates cephalosporin cross-reactivity with penicillin as MEDIUM', () => {
      const inputMedications = [
        buildMedication({ name: 'Cefalexin', drugClass: 'cephalosporins' }),
      ];

      const actualFlags = findAllergyConflicts([buildAllergy()], inputMedications);

      expect(actualFlags[0].severity).toBe('MEDIUM');
    });

    it('flags a medication whose name contains an allergen with no class rule', () => {
      const inputAllergies = [buildAllergy({ substance: 'Codeine' })];
      const inputMedications = [
        buildMedication({ name: 'Codeine phosphate', drugClass: 'opioids' }),
      ];

      const actualFlags = findAllergyConflicts(inputAllergies, inputMedications);

      expect(actualFlags).toHaveLength(1);
    });

    it('returns nothing when no medication matches an allergy', () => {
      const actualFlags = findAllergyConflicts([buildAllergy()], [buildMedication()]);

      expect(actualFlags).toEqual([]);
    });
  });

  describe('findDrugInteractions', () => {
    it('flags warfarin with an NSAID regardless of order', () => {
      const inputMedications = [
        buildMedication({ id: 'ibu', name: 'Ibuprofen', drugClass: 'nsaids' }),
        buildMedication({ id: 'warf', name: 'Warfarin', drugClass: 'anticoagulants' }),
      ];

      const actualFlags = findDrugInteractions(inputMedications);

      expect(actualFlags).toHaveLength(1);
      expect(actualFlags[0]).toMatchObject({ kind: 'DRUG_INTERACTION', severity: 'HIGH' });
      expect(actualFlags[0].message).toContain('bleeding');
    });

    it('does not pair a drug class with itself', () => {
      const inputMedications = [
        buildMedication({ id: 'a', name: 'Ibuprofen', drugClass: 'nsaids' }),
        buildMedication({ id: 'b', name: 'Naproxen', drugClass: 'nsaids' }),
      ];

      expect(findDrugInteractions(inputMedications)).toEqual([]);
    });
  });

  describe('findDrugConditionConflicts', () => {
    it('flags a steroid for a diabetic patient and names who prescribed it', () => {
      const inputMedications = [
        buildMedication({
          name: 'Prednisone',
          drugClass: 'corticosteroids',
          prescribedBy: { id: 'ortho', name: 'Dr. Ruiz' },
        }),
      ];

      const actualFlags = findDrugConditionConflicts(inputMedications, [
        buildDiagnosis({ code: 'E11.9' }),
      ]);

      expect(actualFlags).toHaveLength(1);
      expect(actualFlags[0].message).toContain('Dr. Ruiz');
      expect(actualFlags[0].message).toContain('raise blood glucose');
    });

    it('ignores a condition without a code', () => {
      const inputMedications = [buildMedication({ drugClass: 'corticosteroids' })];

      expect(
        findDrugConditionConflicts(inputMedications, [buildDiagnosis({ code: null })]),
      ).toEqual([]);
    });
  });

  describe('findContradictions', () => {
    it('flags an active medication the patient later said they stopped', () => {
      const inputTranscripts = [
        buildTranscript({
          content: 'Doctor: Any changes?\nPatient: I stopped my metformin last month.',
        }),
      ];

      const actualFlags = findContradictions([buildMedication()], inputTranscripts);

      expect(actualFlags).toHaveLength(1);
      expect(actualFlags[0].kind).toBe('CONTRADICTION');
      expect(actualFlags[0].message).toContain('I stopped my metformin last month.');
    });

    it('ignores the doctor telling the patient not to stop', () => {
      const inputTranscripts = [
        buildTranscript({ content: "Doctor: Don't stop taking your metformin.\nPatient: Okay." }),
      ];

      expect(findContradictions([buildMedication()], inputTranscripts)).toEqual([]);
    });

    it('ignores transcripts from before the medication started', () => {
      const inputTranscripts = [
        buildTranscript({
          content: 'Patient: I stopped metformin years ago.',
          recordedAt: '2025-06-01T10:00:00.000Z',
        }),
      ];

      expect(findContradictions([buildMedication()], inputTranscripts)).toEqual([]);
    });
  });

  describe('buildLabTrends', () => {
    it('orders points oldest first and detects a rising out-of-range series', () => {
      const inputLabs = [
        buildLab({ id: 'c', value: 8.1, collectedAt: '2026-09-01T08:00:00.000Z' }),
        buildLab({ id: 'a', value: 6.8, collectedAt: '2025-09-01T08:00:00.000Z' }),
        buildLab({ id: 'b', value: 7.4, collectedAt: '2026-03-01T08:00:00.000Z' }),
      ];

      const [actualTrend] = buildLabTrends(inputLabs, 'ENDOCRINOLOGY');

      expect(actualTrend.points.map(({ value }) => value)).toEqual([6.8, 7.4, 8.1]);
      expect(actualTrend.direction).toBe('RISING');
      expect(actualTrend.isLatestOutOfRange).toBe(true);
      expect(actualTrend.isRelevant).toBe(true);
    });

    it('sorts tests relevant to the specialty first when all are in range', () => {
      const inputLabs = [
        buildLab({ id: 'hba1c', testCode: 'HBA1C', testName: 'HbA1c', value: 5.2 }),
        buildLab({
          id: 'ldl',
          testCode: 'LDL',
          testName: 'LDL cholesterol',
          value: 90,
          referenceHigh: 100,
        }),
      ];

      const actualTrends = buildLabTrends(inputLabs, 'CARDIOLOGY');

      expect(actualTrends.map(({ testCode }) => testCode)).toEqual(['LDL', 'HBA1C']);
    });

    it('sorts an out-of-range result above a relevant normal one', () => {
      const inputLabs = [
        buildLab({
          id: 'ldl',
          testCode: 'LDL',
          testName: 'LDL cholesterol',
          value: 90,
          referenceHigh: 100,
        }),
        buildLab({ id: 'hba1c', testCode: 'HBA1C', testName: 'HbA1c', value: 8.1 }),
      ];

      const actualTrends = buildLabTrends(inputLabs, 'CARDIOLOGY');

      expect(actualTrends.map(({ testCode }) => testCode)).toEqual(['HBA1C', 'LDL']);
      expect(actualTrends[0].isRelevant).toBe(false);
    });

    it('treats every test as relevant to general practice', () => {
      const actualTrends = buildLabTrends(
        [buildLab({ testCode: 'VITAMIN_D' })],
        'GENERAL_PRACTICE',
      );

      expect(actualTrends[0].isRelevant).toBe(true);
    });
  });
});
