import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalAssistantService } from './clinical-assistant.service';
import { OpenRouterGateway } from './openrouter.gateway';
import { PatientsService } from '../patients/patients.service';
import { PatientBrainService } from '../patient-brain/patient-brain.service';
import { RedisService } from '../redis/redis.service';
import { buildPatientBrief } from '../patients/brief/build-patient-brief';
import { buildAllergy, buildMedication, buildRecord } from '../patients/brief/test-records';

describe('ClinicalAssistantService', () => {
  let service: ClinicalAssistantService;
  let mockGateway: { chat: jest.Mock; model: string; isEnabled: boolean };
  let mockBrain: { isSynced: jest.Mock; retrieve: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock };

  const ORG = 'org-1';
  const USER = 'user-1';
  const PATIENT = 'patient-1';

  const inputRecord = buildRecord({
    allergies: [buildAllergy({ id: 'a1' })],
    medications: [buildMedication({ id: 'm1' })],
  });
  const inputBrief = buildPatientBrief(inputRecord, {
    specialty: 'ENDOCRINOLOGY',
    viewerId: USER,
    now: new Date('2026-10-12T12:00:00Z'),
  });

  beforeEach(async () => {
    mockGateway = {
      chat: jest.fn().mockResolvedValue('She is allergic to penicillin [1].'),
      model: 'anthropic/claude-sonnet-5.5',
      isEnabled: true,
    };
    mockBrain = {
      isSynced: jest.fn().mockResolvedValue(false),
      retrieve: jest.fn().mockResolvedValue({ excerpts: [], relations: [] }),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalAssistantService,
        { provide: OpenRouterGateway, useValue: mockGateway },
        { provide: PatientBrainService, useValue: mockBrain },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: PatientsService,
          useValue: {
            getRecordWithBrief: jest
              .fn()
              .mockResolvedValue({ record: inputRecord, brief: inputBrief }),
          },
        },
      ],
    }).compile();

    service = module.get(ClinicalAssistantService);
  });

  describe('answer', () => {
    it('answers from the full record when the patient is not in the brain', async () => {
      // Act
      const actualAnswer = await service.answer(USER, ORG, PATIENT, 'Any allergies?');

      // Assert
      expect(actualAnswer.contextOrigin).toBe('RECORD');
      expect(mockBrain.retrieve).not.toHaveBeenCalled();
      expect(actualAnswer.citations[0]).toMatchObject({
        marker: 1,
        source: { type: 'ALLERGY', id: 'a1' },
      });
    });

    it('uses patient-brain passages when the patient is synced', async () => {
      mockBrain.isSynced.mockResolvedValue(true);
      mockBrain.retrieve.mockResolvedValue({
        excerpts: [
          {
            content: 'Patient: I stopped my metformin.',
            title: 'Visit transcript',
            relevancyScore: 0.9,
            source: { type: 'TRANSCRIPT', id: 't1', label: 'Transcript' },
          },
        ],
        relations: [],
      });

      const actualAnswer = await service.answer(USER, ORG, PATIENT, 'Did she stop metformin?');

      expect(actualAnswer.contextOrigin).toBe('PATIENT_BRAIN');
      const prompt = mockGateway.chat.mock.calls[0][0].messages[1].content as string;
      expect(prompt).toContain('I stopped my metformin');
      // Core facts ride along even when retrieval succeeds
      expect(prompt).toContain('Allergy: Penicillin');
    });

    it('falls back to the record when the brain errors', async () => {
      mockBrain.isSynced.mockResolvedValue(true);
      mockBrain.retrieve.mockRejectedValue(new ServiceUnavailableException('down'));

      const actualAnswer = await service.answer(USER, ORG, PATIENT, 'Any allergies?');

      expect(actualAnswer.contextOrigin).toBe('RECORD');
    });
  });

  describe('summarize', () => {
    it('returns a cached summary without calling the model', async () => {
      const cachedSummary = { summary: 'cached', suggestedQuestions: [], citations: [] };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedSummary));

      const actualSummary = await service.summarize(USER, ORG, PATIENT);

      expect(actualSummary).toEqual(cachedSummary);
      expect(mockGateway.chat).not.toHaveBeenCalled();
    });

    it('cleans citations in the summary and questions, then caches it', async () => {
      mockGateway.chat.mockResolvedValue(
        JSON.stringify({
          summary: 'Allergic to penicillin [1] [99].',
          suggested_questions: [{ question: 'Any rash?', rationale: 'Penicillin allergy [1].' }],
        }),
      );

      const actualSummary = await service.summarize(USER, ORG, PATIENT);

      expect(actualSummary.summary).toBe('Allergic to penicillin [1].');
      expect(actualSummary.citations.map(({ marker }) => marker)).toEqual([1]);
      expect(actualSummary.specialty).toBe('ENDOCRINOLOGY');
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('fails with 503 when the model does not return a usable summary', async () => {
      mockGateway.chat.mockResolvedValue('Sorry, I cannot do that.');

      await expect(service.summarize(USER, ORG, PATIENT)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('still answers when the cache is down', async () => {
      mockRedis.get.mockRejectedValue(new Error('redis down'));
      mockGateway.chat.mockResolvedValue('{"summary": "ok [1]", "suggested_questions": []}');

      await expect(service.summarize(USER, ORG, PATIENT)).resolves.toMatchObject({
        summary: 'ok [1]',
      });
    });
  });
});
