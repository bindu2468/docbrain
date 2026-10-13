import { Injectable } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import {
  ClinicianProfileResponse,
  MedicalSpecialty,
  PatientBriefResponse,
  PatientListResponse,
  PatientRecordResponse,
  ScheduleResponse,
} from '@docbrain/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildPatientBrief } from './brief/build-patient-brief';
import {
  DOCTOR_SELECT,
  ageOn,
  patientRecordInclude,
  toDateOnly,
  toDoctorRef,
  toPatientRecord,
} from './patient.mapper';
import {
  PatientAccessDeniedException,
  PatientNotFoundException,
} from './exceptions/patients.exceptions';

/**
 * Patient records, the clinic schedule, and the pre-visit brief.
 *
 * Follows `ProjectsService`: every query filters by `organizationId`, and a
 * patient is loaded by id *and* organization so another clinic's id reads as
 * 404. Unlike projects, the caller's membership is checked *before* the
 * lookup, so a non-member cannot use 403-vs-404 to probe which ids exist.
 *
 * Every member of the clinic can read every patient. Limiting access to the
 * patient's own care team is a known gap, not built for the demo.
 */
@Injectable()
export class PatientsService {
  private static readonly READ_ROLES: readonly OrgRole[] = [
    OrgRole.OWNER,
    OrgRole.ADMIN,
    OrgRole.MEMBER,
  ];

  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    organizationId: string,
    search?: string,
  ): Promise<PatientListResponse> {
    await this.requireMember(userId, organizationId);
    const now = new Date();
    // Count today's earlier appointments as "next" — the doctor may still be
    // running behind on them
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const term = search?.trim();
    const where: Prisma.PatientWhereInput = {
      organizationId,
      archivedAt: null,
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { mrn: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const patients = await this.prisma.patient.findMany({
      where,
      include: {
        _count: { select: { allergies: { where: { organizationId } } } },
        visits: {
          where: { organizationId, status: 'SCHEDULED', scheduledAt: { gte: startOfToday } },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: { scheduledAt: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return {
      items: patients.map((patient) => ({
        id: patient.id,
        mrn: patient.mrn,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: toDateOnly(patient.dateOfBirth),
        age: ageOn(patient.dateOfBirth, now),
        sex: patient.sex,
        allergyCount: patient._count.allergies,
        nextVisitAt: patient.visits[0]?.scheduledAt.toISOString() ?? null,
      })),
      total: patients.length,
    };
  }

  async findRecord(
    userId: string,
    organizationId: string,
    patientId: string,
  ): Promise<PatientRecordResponse> {
    await this.requireMember(userId, organizationId);
    return this.loadRecord(organizationId, patientId);
  }

  /**
   * Build the pre-visit brief. `specialty` overrides the caller's own, so a
   * doctor can see what a colleague in another specialty would see first.
   */
  async getBrief(
    userId: string,
    organizationId: string,
    patientId: string,
    specialty?: MedicalSpecialty,
  ): Promise<PatientBriefResponse> {
    const { brief } = await this.getRecordWithBrief(userId, organizationId, patientId, specialty);
    return brief;
  }

  /**
   * The full record and its brief from one access check and one load, for
   * callers that need both (the clinical assistant).
   */
  async getRecordWithBrief(
    userId: string,
    organizationId: string,
    patientId: string,
    specialty?: MedicalSpecialty,
  ): Promise<{ record: PatientRecordResponse; brief: PatientBriefResponse }> {
    const member = await this.requireMember(userId, organizationId);
    const record = await this.loadRecord(organizationId, patientId);
    const brief = buildPatientBrief(record, {
      specialty: specialty ?? member.specialty,
      viewerId: userId,
      now: new Date(),
    });

    return { record, brief };
  }

  async getSchedule(
    userId: string,
    organizationId: string,
    from: Date,
    to: Date,
    isMineOnly = false,
  ): Promise<ScheduleResponse> {
    await this.requireMember(userId, organizationId);
    const now = new Date();

    const visits = await this.prisma.visit.findMany({
      where: {
        organizationId,
        scheduledAt: { gte: from, lt: to },
        patient: { archivedAt: null },
        ...(isMineOnly ? { doctorId: userId } : {}),
      },
      include: {
        doctor: { select: DOCTOR_SELECT },
        patient: { include: { _count: { select: { allergies: { where: { organizationId } } } } } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return {
      items: visits.map((visit) => ({
        visitId: visit.id,
        scheduledAt: visit.scheduledAt.toISOString(),
        status: visit.status,
        reason: visit.reason,
        specialty: visit.specialty,
        doctor: toDoctorRef(visit.doctor),
        patient: {
          id: visit.patient.id,
          firstName: visit.patient.firstName,
          lastName: visit.patient.lastName,
          age: ageOn(visit.patient.dateOfBirth, now),
          sex: visit.patient.sex,
          allergyCount: visit.patient._count.allergies,
        },
      })),
    };
  }

  async getClinicianProfile(
    userId: string,
    organizationId: string,
  ): Promise<ClinicianProfileResponse> {
    const member = await this.requireMember(userId, organizationId);
    return this.toClinicianProfile(member);
  }

  /** A member may set their own specialty; nobody else's. */
  async updateClinicianProfile(
    userId: string,
    organizationId: string,
    specialty: MedicalSpecialty | null,
  ): Promise<ClinicianProfileResponse> {
    const member = await this.requireMember(userId, organizationId);

    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { specialty },
      include: { user: { select: DOCTOR_SELECT } },
    });

    return this.toClinicianProfile(updated);
  }

  /**
   * Load a patient by id *and* organization so that a valid id from another
   * tenant reads as "not found" rather than leaking its existence.
   */
  private async loadRecord(
    organizationId: string,
    patientId: string,
  ): Promise<PatientRecordResponse> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId, archivedAt: null },
      include: patientRecordInclude(organizationId),
    });

    if (!patient) {
      throw new PatientNotFoundException(patientId);
    }

    return toPatientRecord(patient, new Date());
  }

  /**
   * Resolve the caller's membership. Reads the member row directly rather than
   * via `OrganizationsService.getUserRoleInOrganization`, because the brief
   * also needs the member's specialty.
   */
  private async requireMember(userId: string, organizationId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { user: { select: DOCTOR_SELECT } },
    });

    if (!member || !PatientsService.READ_ROLES.includes(member.role)) {
      throw new PatientAccessDeniedException('view patients in');
    }

    return member;
  }

  private toClinicianProfile(member: {
    userId: string;
    specialty: MedicalSpecialty | null;
    user: { id: string; name: string | null; email: string };
  }): ClinicianProfileResponse {
    return {
      userId: member.userId,
      name: toDoctorRef(member.user).name,
      specialty: member.specialty,
    };
  }
}
