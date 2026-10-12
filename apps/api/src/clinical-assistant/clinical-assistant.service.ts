import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AssistantAnswerResponse,
  AssistantConfigResponse,
  AssistantContextOrigin,
  MedicalSpecialty,
  PatientBriefResponse,
  PatientRecordResponse,
  PatientSummaryResponse,
} from '@app-starter/shared';
import { RedisService } from '../redis/redis.service';
import { PatientsService } from '../patients/patients.service';
import { PatientBrainService } from '../patient-brain/patient-brain.service';
import { buildBrainDocuments } from '../patient-brain/brain-documents';
import { OpenRouterGateway } from './openrouter.gateway';
import {
  ContextEntry,
  briefHighlightEntries,
  buildAnswerMessages,
  buildSummaryMessages,
  coreFactEntries,
  excerptEntries,
  numberEntries,
  parseSummary,
  recordEntries,
  sanitizeCitations,
  toCitations,
} from './assistant-context';

// Budgets include the model's mandatory reasoning, not just the visible reply
const ANSWER_MAX_TOKENS = 2_500;
const SUMMARY_MAX_TOKENS = 4_000;
const SUMMARY_CACHE_TTL_SECONDS = 24 * 60 * 60;
/** Bump when the summary prompt changes, so cached summaries are regenerated */
const SUMMARY_PROMPT_VERSION = 2;

/**
 * Written answers and pre-visit summaries from a language model, grounded in
 * the patient's records.
 *
 * The model only ever sees numbered records, must cite them, and has its
 * citations checked against what it was given (`assistant-context.ts`).
 * Allergies, flags, current medications, and active conditions go into every
 * prompt whatever retrieval returns. None of this replaces the rule-based
 * brief: the allergy banner and safety flags never come from the model.
 */
@Injectable()
export class ClinicalAssistantService {
  private readonly logger = new Logger(ClinicalAssistantService.name);

  constructor(
    private readonly patientsService: PatientsService,
    private readonly patientBrainService: PatientBrainService,
    private readonly gateway: OpenRouterGateway,
    private readonly redis: RedisService,
  ) {}

  getConfig(): AssistantConfigResponse {
    return {
      isEnabled: this.gateway.isEnabled,
      model: this.gateway.isEnabled ? this.gateway.model : null,
    };
  }

  async answer(
    userId: string,
    organizationId: string,
    patientId: string,
    question: string,
  ): Promise<AssistantAnswerResponse> {
    const { record, brief } = await this.patientsService.getRecordWithBrief(
      userId,
      organizationId,
      patientId,
    );
    const { entries, origin } = await this.answerContext(organizationId, record, brief, question);

    const reply = await this.gateway.chat({
      messages: buildAnswerMessages(brief, entries, question),
      maxTokens: ANSWER_MAX_TOKENS,
    });
    const { text, used } = sanitizeCitations(reply, entries);

    return {
      question,
      answer: text,
      citations: toCitations(entries, used),
      contextOrigin: origin,
      model: this.gateway.model,
    };
  }

  /**
   * The 30-second pre-visit narrative plus questions to ask, for one
   * specialty lens. Cached per record version and day, since the "since last
   * visit" window moves with the date.
   */
  async summarize(
    userId: string,
    organizationId: string,
    patientId: string,
    specialty?: MedicalSpecialty,
  ): Promise<PatientSummaryResponse> {
    const { record, brief } = await this.patientsService.getRecordWithBrief(
      userId,
      organizationId,
      patientId,
      specialty,
    );

    const cacheKey = this.summaryCacheKey(organizationId, record, brief.specialty);
    const cached = await this.readCache(cacheKey);
    if (cached) return cached;

    const entries = numberEntries([
      ...coreFactEntries(brief),
      ...briefHighlightEntries(brief),
      ...recordEntries(buildBrainDocuments(record, [], organizationId).items),
    ]);

    const reply = await this.gateway.chat({
      messages: buildSummaryMessages(brief, entries),
      maxTokens: SUMMARY_MAX_TOKENS,
    });
    const parsed = parseSummary(reply);
    if (!parsed) {
      this.logger.warn(`Unparseable summary from ${this.gateway.model}`);
      throw new ServiceUnavailableException(
        'The assistant could not produce a summary. Try again.',
      );
    }

    const used = new Set<number>();
    const clean = (value: string) => {
      const result = sanitizeCitations(value, entries);
      result.used.forEach((marker) => used.add(marker));
      return result.text;
    };

    const summary: PatientSummaryResponse = {
      specialty: brief.specialty,
      summary: clean(parsed.summary),
      suggestedQuestions: parsed.suggestedQuestions.map(({ question, rationale }) => ({
        question: clean(question),
        rationale: clean(rationale),
      })),
      citations: [],
      model: this.gateway.model,
      generatedAt: new Date().toISOString(),
    };
    summary.citations = toCitations(entries, used);

    await this.writeCache(cacheKey, summary);
    return summary;
  }

  /**
   * Core facts always, then HydraDB's passages for the question when the
   * patient is in the brain; otherwise every record from Postgres. A brain
   * outage degrades to the full record rather than failing the answer.
   */
  private async answerContext(
    organizationId: string,
    record: PatientRecordResponse,
    brief: PatientBriefResponse,
    question: string,
  ): Promise<{ entries: ContextEntry[]; origin: AssistantContextOrigin }> {
    const core = coreFactEntries(brief);

    if (await this.patientBrainService.isSynced(organizationId, record.id)) {
      try {
        const { excerpts } = await this.patientBrainService.retrieve(
          organizationId,
          record.id,
          question,
        );
        if (excerpts.length > 0) {
          return {
            entries: numberEntries([...core, ...excerptEntries(excerpts)]),
            origin: 'PATIENT_BRAIN',
          };
        }
      } catch (error) {
        this.logger.warn(
          `Patient brain unavailable, answering from the record: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const records = recordEntries(buildBrainDocuments(record, [], organizationId).items);
    return { entries: numberEntries([...core, ...records]), origin: 'RECORD' };
  }

  private summaryCacheKey(
    organizationId: string,
    record: PatientRecordResponse,
    specialty: MedicalSpecialty | null,
  ): string {
    const version = createHash('sha256')
      .update(JSON.stringify(record))
      .update(new Date().toISOString().slice(0, 10))
      .update(this.gateway.model)
      .digest('hex')
      .slice(0, 32);
    return `assistant:summary:v${SUMMARY_PROMPT_VERSION}:${organizationId}:${record.id}:${specialty ?? 'all'}:${version}`;
  }

  // A cache failure must never fail the request — it only costs a model call
  private async readCache(key: string): Promise<PatientSummaryResponse | null> {
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as PatientSummaryResponse) : null;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, summary: PatientSummaryResponse): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(summary), SUMMARY_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Could not cache summary: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
