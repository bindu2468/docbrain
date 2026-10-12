import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ClinicianProfileResponse,
  PatientBriefResponse,
  PatientListResponse,
  PatientRecordResponse,
  ScheduleResponse,
  TokenPayload,
} from '@app-starter/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/email-verified.guard';
import { PatientsService } from './patients.service';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { PatientBriefQueryDto } from './dto/patient-brief-query.dto';
import { ScheduleQueryDto } from './dto/schedule-query.dto';
import { UpdateClinicianProfileDto } from './dto/update-clinician-profile.dto';

/**
 * Organization-scoped Patient Brain routes. The organization id sits in the
 * path, as in `ProjectsController`, so tenant scoping cannot be omitted.
 */
@ApiTags('patients')
@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('patients')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List patients in a clinic' })
  async list(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Query() query: ListPatientsQueryDto,
  ): Promise<PatientListResponse> {
    return this.patientsService.list(req.user.sub, organizationId, query.search);
  }

  @Get('patients/:patientId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get a patient's full record" })
  async findRecord(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
  ): Promise<PatientRecordResponse> {
    return this.patientsService.findRecord(req.user.sub, organizationId, patientId);
  }

  @Get('patients/:patientId/brief')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the pre-visit brief for a patient' })
  async getBrief(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
    @Query() query: PatientBriefQueryDto,
  ): Promise<PatientBriefResponse> {
    return this.patientsService.getBrief(req.user.sub, organizationId, patientId, query.specialty);
  }

  @Get('schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List appointments in a time window' })
  async getSchedule(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Query() query: ScheduleQueryDto,
  ): Promise<ScheduleResponse> {
    return this.patientsService.getSchedule(
      req.user.sub,
      organizationId,
      new Date(query.from),
      new Date(query.to),
      query.mine ?? false,
    );
  }

  @Get('clinicians/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the caller's clinical profile in this clinic" })
  async getClinicianProfile(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
  ): Promise<ClinicianProfileResponse> {
    return this.patientsService.getClinicianProfile(req.user.sub, organizationId);
  }

  @Patch('clinicians/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set the caller's specialty in this clinic" })
  async updateClinicianProfile(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Body() data: UpdateClinicianProfileDto,
  ): Promise<ClinicianProfileResponse> {
    return this.patientsService.updateClinicianProfile(
      req.user.sub,
      organizationId,
      data.specialty,
    );
  }
}
