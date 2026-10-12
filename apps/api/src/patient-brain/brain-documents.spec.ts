import {
  brainItemId,
  buildBrainDocuments,
  clinicPrincipal,
  patientCollection,
} from './brain-documents';
import {
  buildAllergy,
  buildDiagnosis,
  buildLab,
  buildMedication,
  buildRecord,
  buildTranscript,
  buildVisit,
} from '../patients/brief/test-records';

describe('buildBrainDocuments', () => {
  const ORG = 'org-1';

  it('creates one item per record with an id that maps back to it', () => {
    // Arrange
    const inputRecord = buildRecord({
      visits: [buildVisit({ id: 'v1' })],
      medications: [buildMedication({ id: 'm1' })],
      allergies: [buildAllergy({ id: 'a1' })],
      labResults: [buildLab({ id: 'l1' })],
    });

    // Act
    const { items } = buildBrainDocuments(inputRecord, [], ORG);

    // Assert
    expect(items.map(({ id }) => id)).toEqual([
      'visit_v1',
      'medication_m1',
      'allergy_a1',
      'lab_result_l1',
    ]);
    expect(items[1].additional_metadata).toEqual({ record_type: 'MEDICATION', record_id: 'm1' });
    // fields.body is what HydraDB indexes; the class must match in both places
    expect(items[1]).toMatchObject({ kind: 'custom', fields: { kind: 'custom' } });
  });

  it('restricts every item to the clinic', () => {
    const inputRecord = buildRecord({ allergies: [buildAllergy()], visits: [buildVisit()] });

    const { items } = buildBrainDocuments(inputRecord, [], ORG);

    expect(items.every(({ acl }) => acl.length === 1 && acl[0] === clinicPrincipal(ORG))).toBe(
      true,
    );
  });

  it('links a medication to its prescriber and condition in the graph', () => {
    const inputRecord = buildRecord({
      diagnoses: [buildDiagnosis({ id: 'dx1', name: 'Type 2 diabetes mellitus' })],
      medications: [
        buildMedication({
          id: 'm1',
          name: 'Prednisone',
          drugClass: 'corticosteroids',
          diagnosisId: 'dx1',
          prescribedBy: { id: 'ortho', name: 'Dr. Ruiz' },
        }),
      ],
    });

    const { graphPayload } = buildBrainDocuments(inputRecord, [], ORG);

    const actualPredicates = graphPayload[brainItemId('MEDICATION', 'm1')].relations.map(
      ({ predicate }) => predicate,
    );
    expect(actualPredicates).toEqual(['TAKES', 'IS_A', 'PRESCRIBED', 'TREATS']);
  });

  it('records why a stopped medication was stopped', () => {
    const inputRecord = buildRecord({
      medications: [
        buildMedication({
          id: 'm1',
          stoppedAt: '2026-02-01T10:00:00.000Z',
          stopReason: 'Dizziness',
        }),
      ],
    });

    const { items, graphPayload } = buildBrainDocuments(inputRecord, [], ORG);

    expect(items[0].fields.body).toContain('Stopped 2026-02-01: Dizziness');
    expect(graphPayload.medication_m1.relations).toContainEqual(
      expect.objectContaining({
        predicate: 'STOPPED',
        context: expect.stringContaining('Dizziness'),
      }),
    );
  });

  it('leaves transcripts out of the graph payload so HydraDB extracts them', () => {
    const inputRecord = buildRecord({
      transcripts: [buildTranscript({ id: 't1', visitId: 'v1' })],
    });

    const { items, graphPayload } = buildBrainDocuments(inputRecord, [], ORG);

    expect(items[0].relations).toEqual({ ids: ['visit_v1'] });
    expect(items[0].fields).toMatchObject({ kind: 'meeting' });
    expect(graphPayload.transcript_t1).toBeUndefined();
  });

  it('reuses one graph node for the same entity across records', () => {
    const inputRecord = buildRecord({
      diagnoses: [buildDiagnosis({ id: 'dx1', name: 'Type 2 Diabetes  mellitus' })],
      medications: [buildMedication({ id: 'm1', diagnosisId: 'dx1' })],
    });

    const { graphPayload } = buildBrainDocuments(inputRecord, [], ORG);

    const diagnosisNodes = Object.keys(graphPayload.diagnosis_dx1.entities);
    const medicationNodes = Object.keys(graphPayload.medication_m1.entities);
    expect(medicationNodes).toEqual(expect.arrayContaining(diagnosisNodes));
  });

  it('includes safety flags linked to the records they cite', () => {
    const inputFlags = [
      {
        kind: 'DRUG_CONDITION' as const,
        severity: 'MEDIUM' as const,
        message: 'Prednisone can raise blood glucose.',
        sources: [
          { type: 'MEDICATION' as const, id: 'm1', label: 'm' },
          { type: 'DIAGNOSIS' as const, id: 'dx1', label: 'd' },
        ],
      },
    ];

    const { items } = buildBrainDocuments(buildRecord(), inputFlags, ORG);

    expect(items).toHaveLength(1);
    expect(items[0].additional_metadata.record_type).toBe('SAFETY_FLAG');
    expect(items[0].relations).toEqual({ ids: ['medication_m1', 'diagnosis_dx1'] });
  });
});

describe('buildBrainDocuments item ids', () => {
  it('keeps every id within the 100-byte limit HydraDB enforces', () => {
    // Arrange
    const longId = 'fefec56e-fdec-4594-b6d0-5b1731652f33';
    const inputRecord = buildRecord({
      labResults: [buildLab({ id: longId })],
      medications: [buildMedication({ id: longId })],
    });
    const inputFlags = [
      {
        kind: 'DRUG_INTERACTION' as const,
        severity: 'HIGH' as const,
        message: 'x',
        sources: [
          { type: 'MEDICATION' as const, id: longId, label: 'a' },
          { type: 'MEDICATION' as const, id: longId.replace('f', 'e'), label: 'b' },
        ],
      },
    ];

    // Act
    const { items } = buildBrainDocuments(inputRecord, inputFlags, 'org-1');

    // Assert
    for (const { id } of items) {
      expect(Buffer.byteLength(id)).toBeLessThanOrEqual(100);
    }
  });

  it('gives a flag the same id for the same cited records', () => {
    const inputFlag = {
      kind: 'CONTRADICTION' as const,
      severity: 'MEDIUM' as const,
      message: 'x',
      sources: [{ type: 'TRANSCRIPT' as const, id: 't1', label: 't' }],
    };

    const first = buildBrainDocuments(buildRecord(), [inputFlag], 'org-1').items[0].id;
    const second = buildBrainDocuments(buildRecord(), [{ ...inputFlag, message: 'y' }], 'org-1')
      .items[0].id;

    expect(first).toBe(second);
  });
});

describe('patientCollection', () => {
  it('builds a collection name HydraDB accepts', () => {
    const actualName = patientCollection('fefec56e-fdec-4594-b6d0-5b1731652f33');

    expect(actualName).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
  });
});
