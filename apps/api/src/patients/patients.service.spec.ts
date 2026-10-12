import { Test, TestingModule } from '@nestjs/testing';
import { OrgRole } from '@prisma/client';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PatientAccessDeniedException,
  PatientNotFoundException,
} from './exceptions/patients.exceptions';

describe('PatientsService', () => {
  let service: PatientsService;
  let mockPrisma: any;

  const ORG = 'org-1';
  const USER = 'user-1';

  const buildMember = (overrides: Record<string, unknown> = {}) => ({
    id: 'member-1',
    userId: USER,
    organizationId: ORG,
    role: OrgRole.MEMBER,
    specialty: 'ENDOCRINOLOGY',
    user: { id: USER, name: 'Dr. Mo', email: 'mo@example.com' },
    ...overrides,
  });

  const buildPatientRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'patient-1',
    organizationId: ORG,
    mrn: 'MRN-1',
    firstName: 'Maria',
    lastName: 'Gonzalez',
    dateOfBirth: new Date('1968-04-17T00:00:00Z'),
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

  beforeEach(async () => {
    mockPrisma = {
      organizationMember: {
        findUnique: jest.fn().mockResolvedValue(buildMember()),
        update: jest.fn().mockImplementation(({ data }) => buildMember(data)),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue(buildPatientRow()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      visit: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PatientsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  describe('findRecord', () => {
    it('rejects a caller who is not a member before looking the patient up', async () => {
      // Arrange
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

      // Act
      const actual = service.findRecord(USER, ORG, 'patient-1');

      // Assert
      await expect(actual).rejects.toThrow(PatientAccessDeniedException);
      expect(mockPrisma.patient.findFirst).not.toHaveBeenCalled();
    });

    it('reads a patient from another organization as not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.findRecord(USER, ORG, 'other-tenant-patient')).rejects.toThrow(
        PatientNotFoundException,
      );
    });

    it('loads the patient by id and organization, and scopes every child relation', async () => {
      await service.findRecord(USER, ORG, 'patient-1');

      const actualQuery = mockPrisma.patient.findFirst.mock.calls[0][0];
      expect(actualQuery.where).toEqual({ id: 'patient-1', organizationId: ORG, archivedAt: null });
      for (const relation of Object.values(actualQuery.include) as Array<{ where: unknown }>) {
        expect(relation.where).toEqual(expect.objectContaining({ organizationId: ORG }));
      }
    });
  });

  describe('list', () => {
    it('scopes the query to the organization and searches name and MRN', async () => {
      await service.list(USER, ORG, 'gonz');

      const actualWhere = mockPrisma.patient.findMany.mock.calls[0][0].where;
      expect(actualWhere.organizationId).toBe(ORG);
      expect(actualWhere.archivedAt).toBeNull();
      expect(actualWhere.OR).toHaveLength(3);
    });
  });

  describe('getBrief', () => {
    it("builds the brief through the caller's own specialty by default", async () => {
      const actualBrief = await service.getBrief(USER, ORG, 'patient-1');

      expect(actualBrief.specialty).toBe('ENDOCRINOLOGY');
    });

    it('builds the brief through a requested specialty instead', async () => {
      const actualBrief = await service.getBrief(USER, ORG, 'patient-1', 'CARDIOLOGY');

      expect(actualBrief.specialty).toBe('CARDIOLOGY');
    });
  });

  describe('getSchedule', () => {
    it("filters to the caller's own visits when asked", async () => {
      const inputFrom = new Date('2026-10-12T00:00:00Z');
      const inputTo = new Date('2026-10-13T00:00:00Z');

      await service.getSchedule(USER, ORG, inputFrom, inputTo, true);

      const actualWhere = mockPrisma.visit.findMany.mock.calls[0][0].where;
      expect(actualWhere).toMatchObject({
        organizationId: ORG,
        doctorId: USER,
        scheduledAt: { gte: inputFrom, lt: inputTo },
      });
    });
  });

  describe('updateClinicianProfile', () => {
    it("updates only the caller's own membership", async () => {
      const actualProfile = await service.updateClinicianProfile(USER, ORG, 'CARDIOLOGY');

      expect(mockPrisma.organizationMember.update.mock.calls[0][0].where).toEqual({
        id: 'member-1',
      });
      expect(actualProfile.specialty).toBe('CARDIOLOGY');
    });
  });
});
