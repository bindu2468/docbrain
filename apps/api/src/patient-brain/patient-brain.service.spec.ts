import { Test, TestingModule } from '@nestjs/testing';
import { PatientBrainService } from './patient-brain.service';
import { HydraDbGateway } from './hydra-db.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { PatientAccessDeniedException } from '../patients/exceptions/patients.exceptions';
import { buildAllergy, buildRecord } from '../patients/brief/test-records';
import { clinicPrincipal, patientCollection } from './brain-documents';

describe('PatientBrainService', () => {
  let service: PatientBrainService;
  let mockPrisma: any;
  let mockPatients: { findRecord: jest.Mock };
  let mockGateway: Record<string, any>;

  const ORG = 'org-1';
  const USER = 'user-1';
  const PATIENT = 'patient-1';

  beforeEach(async () => {
    mockPrisma = {
      patientBrainSync: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    mockPatients = {
      findRecord: jest
        .fn()
        .mockResolvedValue(buildRecord({ allergies: [buildAllergy({ id: 'a1' })] })),
    };
    mockGateway = {
      isEnabled: true,
      ensureDatabaseReady: jest.fn().mockResolvedValue(undefined),
      deleteItems: jest.fn().mockResolvedValue([]),
      ingestKnowledge: jest.fn().mockResolvedValue(undefined),
      getIndexingStates: jest.fn().mockResolvedValue(new Map()),
      query: jest.fn().mockResolvedValue({ chunks: [], graphContext: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientBrainService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PatientsService, useValue: mockPatients },
        { provide: HydraDbGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(PatientBrainService);
  });

  describe('sync', () => {
    it('stops before touching HydraDB when the caller cannot read the patient', async () => {
      // Arrange
      mockPatients.findRecord.mockRejectedValue(
        new PatientAccessDeniedException('view patients in'),
      );

      // Act
      const actual = service.sync(USER, ORG, PATIENT);

      // Assert
      await expect(actual).rejects.toThrow(PatientAccessDeniedException);
      expect(mockGateway.ingestKnowledge).not.toHaveBeenCalled();
    });

    it("upserts into the patient's collection and records what was sent", async () => {
      const actualResult = await service.sync(USER, ORG, PATIENT);

      const collection = patientCollection(PATIENT);
      expect(mockGateway.ingestKnowledge.mock.calls[0][0]).toBe(collection);
      expect(mockGateway.deleteItems).toHaveBeenCalledWith(collection, []);
      expect(actualResult.itemCount).toBe(1);
      expect(mockPrisma.patientBrainSync.upsert.mock.calls[0][0].create).toMatchObject({
        organizationId: ORG,
        collection,
        itemIds: ['allergy_a1'],
      });
    });

    it('deletes only the items that disappeared since the last sync', async () => {
      // Arrange
      mockPrisma.patientBrainSync.findFirst.mockResolvedValue({
        itemIds: ['allergy_a1', 'visit_old'],
        staleItemIds: [],
      });

      // Act
      await service.sync(USER, ORG, PATIENT);

      // Assert
      expect(mockGateway.deleteItems).toHaveBeenCalledWith(patientCollection(PATIENT), [
        'visit_old',
      ]);
      expect(mockGateway.ingestKnowledge.mock.invocationCallOrder[0]).toBeLessThan(
        mockGateway.deleteItems.mock.invocationCallOrder[0],
      );
    });
  });

  describe('sync retries', () => {
    it('keeps items HydraDB refused to delete and retries them next time', async () => {
      // Arrange
      mockPrisma.patientBrainSync.findFirst.mockResolvedValue({
        itemIds: ['allergy_a1'],
        staleItemIds: ['visit_still_indexing'],
      });
      mockGateway.deleteItems.mockResolvedValue(['visit_still_indexing']);

      // Act
      await service.sync(USER, ORG, PATIENT);

      // Assert
      expect(mockGateway.deleteItems).toHaveBeenCalledWith(patientCollection(PATIENT), [
        'visit_still_indexing',
      ]);
      expect(mockPrisma.patientBrainSync.upsert.mock.calls[0][0].update.staleItemIds).toEqual([
        'visit_still_indexing',
      ]);
    });
  });

  describe('getStatus', () => {
    it('reports NOT_CONFIGURED without calling HydraDB when no key is set', async () => {
      mockGateway.isEnabled = false;

      const actualStatus = await service.getStatus(USER, ORG, PATIENT);

      expect(actualStatus.state).toBe('NOT_CONFIGURED');
      expect(mockGateway.getIndexingStates).not.toHaveBeenCalled();
    });

    it('reports INDEXING while any item is still pending', async () => {
      mockPrisma.patientBrainSync.findFirst.mockResolvedValue({
        collection: 'c',
        itemIds: ['a', 'b'],
        syncedAt: new Date('2026-10-12T10:00:00Z'),
      });
      mockGateway.getIndexingStates.mockResolvedValue(new Map([['a', 'searchable']]));

      const actualStatus = await service.getStatus(USER, ORG, PATIENT);

      expect(actualStatus.state).toBe('INDEXING');
      expect(actualStatus.counts).toEqual({ total: 2, searchable: 1, pending: 1, failed: 0 });
    });
  });

  describe('ask', () => {
    it("queries only this patient's collection, as this clinic", async () => {
      await service.ask(USER, ORG, PATIENT, 'Why is her sugar rising?');

      expect(mockGateway.query).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: patientCollection(PATIENT),
          acl: [clinicPrincipal(ORG)],
        }),
      );
    });

    it('maps chunks back to their source records and drops unknown record types', async () => {
      mockGateway.query.mockResolvedValue({
        chunks: [
          {
            chunkContent: 'Prednisone 20 mg',
            sourceTitle: 'Medication: Prednisone',
            relevancyScore: 0.9,
            additionalMetadata: { record_type: 'MEDICATION', record_id: 'm1' },
          },
          {
            chunkContent: 'flag',
            additionalMetadata: { record_type: 'SAFETY_FLAG', record_id: 'x' },
          },
        ],
        graphContext: {
          queryPaths: [
            {
              triplets: [
                {
                  source: { name: 'Dr. Ruiz' },
                  relation: { predicate: 'PRESCRIBED', context: 'on 21 Sep' },
                  target: { name: 'Prednisone' },
                },
                {
                  source: { name: 'Dr. Ruiz' },
                  relation: { predicate: 'PRESCRIBED' },
                  target: { name: 'Prednisone' },
                },
              ],
            },
          ],
        },
      });

      const actualAnswer = await service.ask(USER, ORG, PATIENT, 'Who started prednisone?');

      expect(actualAnswer.excerpts[0].source).toEqual({
        type: 'MEDICATION',
        id: 'm1',
        label: 'Medication: Prednisone',
      });
      expect(actualAnswer.excerpts[1].source).toBeNull();
      expect(actualAnswer.relations).toEqual([
        { source: 'Dr. Ruiz', predicate: 'PRESCRIBED', target: 'Prednisone', context: 'on 21 Sep' },
      ]);
    });
  });
});
