import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AssistantAnswerResponse,
  AssistantConfigResponse,
  PatientSummaryResponse,
  TokenPayload,
} from '@docbrain/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/email-verified.guard';
import { ClinicalAssistantService } from './clinical-assistant.service';
import { AssistantAnswerDto } from './dto/assistant-answer.dto';
import { PatientSummaryQueryDto } from './dto/patient-summary-query.dto';

/** Model-written answers and summaries, nested under the patient. */
@ApiTags('clinical-assistant')
@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class ClinicalAssistantController {
  constructor(private readonly assistantService: ClinicalAssistantService) {}

  @Get('assistant/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Whether the clinical assistant is configured' })
  getConfig(): AssistantConfigResponse {
    return this.assistantService.getConfig();
  }

  // Each call is a paid model request, so cap how fast one user can spend
  @Post('patients/:patientId/assistant/answer')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Answer a question from the patient's records, with citations" })
  async answer(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
    @Body() data: AssistantAnswerDto,
  ): Promise<AssistantAnswerResponse> {
    return this.assistantService.answer(req.user.sub, organizationId, patientId, data.question);
  }

  @Get('patients/:patientId/assistant/summary')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pre-visit summary and suggested questions, with citations' })
  async summarize(
    @Request() req: { user: TokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('patientId') patientId: string,
    @Query() query: PatientSummaryQueryDto,
  ): Promise<PatientSummaryResponse> {
    return this.assistantService.summarize(
      req.user.sub,
      organizationId,
      patientId,
      query.specialty,
    );
  }
}
