import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  BrainQueryResponse,
  BrainStatusResponse,
  BrainSyncResponse,
  TokenPayload,
} from '@app-starter/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/email-verified.guard';
import { PatientBrainService } from './patient-brain.service';
import { BrainQueryDto } from './dto/brain-query.dto';

/** Patient brain routes, nested under the patient they belong to. */
@ApiTags('patient-brain')
@Controller('organizations/:organizationId/patients/:patientId/brain')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class PatientBrainController {
  constructor(private readonly patientBrainService: PatientBrainService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Indexing status of a patient's brain" })
  async getStatus(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
  ): Promise<BrainStatusResponse> {
    return this.patientBrainService.getStatus(req.user.sub, organizationId, patientId);
  }

  // Each sync rebuilds the whole collection upstream, so keep it rare
  @Post('sync')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rebuild a patient's brain from their records" })
  async sync(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
  ): Promise<BrainSyncResponse> {
    return this.patientBrainService.sync(req.user.sub, organizationId, patientId);
  }

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ask a question about a patient's history" })
  async query(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
    @Body() data: BrainQueryDto,
  ): Promise<BrainQueryResponse> {
    return this.patientBrainService.ask(req.user.sub, organizationId, patientId, data.question);
  }
}
