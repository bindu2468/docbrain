import { Injectable } from '@nestjs/common';
import { HydraDB } from '@hydradb/sdk';
import {
  BrainExcerpt,
  BrainQueryResponse,
  BrainRelation,
  BrainStatusResponse,
  BrainSyncResponse,
  ClinicalSource,
  ClinicalSourceType,
  PatientRecordResponse,
} from '@docbrain/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { buildPatientBrief } from '../patients/brief/build-patient-brief';
import { buildBrainDocuments, clinicPrincipal, patientCollection } from './brain-documents';
import { HydraDbGateway } from './hydra-db.gateway';

const CLINICAL_SOURCE_TYPES: readonly ClinicalSourceType[] = [
  'VISIT',
  'TRANSCRIPT',
  'DIAGNOSIS',
  'MEDICATION',
  'ALLERGY',
  'LAB_RESULT',
  'TREATMENT',
];

const MAX_EXCERPTS = 8;
const MAX_RELATIONS = 12;

/**
 * The patient brain: a HydraDB copy of each patient's records, searchable by
 * meaning and linked as a graph.
 *
 * Postgres stays the source of truth. A sync rebuilds the patient's HydraDB
 * collection from the current records; queries never write back. Access is
 * checked against Postgres first (via `PatientsService`), so a caller who
 * cannot read the patient cannot reach their brain either.
 */
@Injectable()
export class PatientBrainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly gateway: HydraDbGateway,
  ) {}

  async getStatus(
    userId: string,
    organizationId: string,
    patientId: string,
  ): Promise<BrainStatusResponse> {
    await this.patientsService.findRecord(userId, organizationId, patientId);

    const emptyCounts = { total: 0, searchable: 0, pending: 0, failed: 0 };
    if (!this.gateway.isEnabled) {
      return { state: 'NOT_CONFIGURED', counts: emptyCounts, lastSyncedAt: null };
    }

    const sync = await this.prisma.patientBrainSync.findFirst({
      where: { organizationId, patientId },
    });
    if (!sync) {
      return { state: 'NOT_SYNCED', counts: emptyCounts, lastSyncedAt: null };
    }

    const states = await this.gateway.getIndexingStates(sync.collection, sync.itemIds);
    const counts = { ...emptyCounts, total: sync.itemIds.length };
    for (const id of sync.itemIds) {
      counts[states.get(id) ?? 'pending'] += 1;
    }

    return {
      state: counts.failed > 0 ? 'FAILED' : counts.pending > 0 ? 'INDEXING' : 'READY',
      counts,
      lastSyncedAt: sync.syncedAt.toISOString(),
    };
  }

  /** Bring one patient's brain up to date with their current records. */
  async sync(
    userId: string,
    organizationId: string,
    patientId: string,
  ): Promise<BrainSyncResponse> {
    const record = await this.patientsService.findRecord(userId, organizationId, patientId);
    return this.syncRecord(organizationId, record, userId);
  }

  /**
   * Sync an already-loaded, already-authorized record. Public for the CLI in
   * `scripts/brain-sync.ts`, which runs without a signed-in user.
   */
  async syncRecord(
    organizationId: string,
    record: PatientRecordResponse,
    viewerId: string,
  ): Promise<BrainSyncResponse> {
    const now = new Date();
    const { safetyFlags } = buildPatientBrief(record, { specialty: null, viewerId, now });
    const { items, graphPayload } = buildBrainDocuments(record, safetyFlags, organizationId);
    const collection = patientCollection(record.id);

    const itemIds = items.map(({ id }) => id);
    const previous = await this.prisma.patientBrainSync.findFirst({
      where: { organizationId, patientId: record.id },
      select: { itemIds: true, staleItemIds: true },
    });

    await this.gateway.ensureDatabaseReady();
    // Upsert by stable id, then remove only what disappeared from Postgres
    // since the last sync (e.g. history rebuilt by the seed)
    await this.gateway.ingestKnowledge(collection, items, graphPayload);
    const current = new Set(itemIds);
    const staleIds = [...(previous?.itemIds ?? []), ...(previous?.staleItemIds ?? [])].filter(
      (id) => !current.has(id),
    );
    const staleItemIds = await this.gateway.deleteItems(collection, [...new Set(staleIds)]);

    await this.prisma.patientBrainSync.upsert({
      where: { patientId: record.id },
      update: { collection, itemIds, staleItemIds, syncedAt: now },
      create: {
        organizationId,
        patientId: record.id,
        collection,
        itemIds,
        staleItemIds,
        syncedAt: now,
      },
    });

    return { itemCount: items.length, syncedAt: now.toISOString() };
  }

  /**
   * Ask the brain about one patient. Returns the retrieved passages, each tied
   * to its record, and the graph links HydraDB followed. No model writes an
   * answer here — the passages are the answer, with their sources.
   */
  async ask(
    userId: string,
    organizationId: string,
    patientId: string,
    question: string,
  ): Promise<BrainQueryResponse> {
    await this.patientsService.findRecord(userId, organizationId, patientId);
    return this.retrieve(organizationId, patientId, question);
  }

  /**
   * Whether this patient has been sent to the brain at all. Cheap — reads
   * Postgres only — so callers can skip HydraDB for a patient never synced.
   */
  async isSynced(organizationId: string, patientId: string): Promise<boolean> {
    if (!this.gateway.isEnabled) return false;
    const sync = await this.prisma.patientBrainSync.findFirst({
      where: { organizationId, patientId },
      select: { id: true },
    });
    return sync !== null;
  }

  /**
   * Query the brain without an access check. Only for callers that have
   * already authorized the patient, such as the clinical assistant.
   */
  async retrieve(
    organizationId: string,
    patientId: string,
    question: string,
  ): Promise<BrainQueryResponse> {
    const result = await this.gateway.query({
      collection: patientCollection(patientId),
      question,
      acl: [clinicPrincipal(organizationId)],
      maxResults: MAX_EXCERPTS,
    });

    return {
      question,
      excerpts: (result.chunks ?? []).slice(0, MAX_EXCERPTS).map(toExcerpt),
      relations: toRelations(result.graphContext).slice(0, MAX_RELATIONS),
    };
  }
}

const isClinicalSourceType = (value: unknown): value is ClinicalSourceType =>
  typeof value === 'string' && (CLINICAL_SOURCE_TYPES as readonly string[]).includes(value);

/**
 * Map a chunk back to the Postgres record it was ingested from, using the
 * metadata set in `buildBrainDocuments`. Safety-flag items and anything
 * HydraDB returns without that metadata have no record to link to.
 */
const toSource = (chunk: HydraDB.SearchV2Chunk): ClinicalSource | null => {
  const recordType = chunk.additionalMetadata?.record_type;
  const recordId = chunk.additionalMetadata?.record_id;

  if (!isClinicalSourceType(recordType) || typeof recordId !== 'string') return null;
  return { type: recordType, id: recordId, label: chunk.sourceTitle ?? recordType };
};

const toExcerpt = (chunk: HydraDB.SearchV2Chunk): BrainExcerpt => ({
  content: chunk.chunkContent ?? '',
  title: chunk.sourceTitle ?? 'Untitled',
  relevancyScore: chunk.relevancyScore ?? null,
  source: toSource(chunk),
});

const readName = (node: Record<string, unknown> | undefined): string => {
  const name = node?.name ?? node?.entity ?? node?.id;
  return typeof name === 'string' ? name : '';
};

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

/**
 * Flatten graph paths into unique triplets. The path shape is loosely typed
 * in the SDK, so every field is read defensively.
 */
const toRelations = (graph: HydraDB.SearchGraphContext | undefined): BrainRelation[] => {
  const paths = [...(graph?.queryPaths ?? []), ...(graph?.chunkRelations ?? [])];
  const seen = new Set<string>();
  const relations: BrainRelation[] = [];

  for (const triplet of paths.flatMap((path) => path.triplets ?? [])) {
    const source = readName(triplet.source);
    const target = readName(triplet.target);
    const predicate =
      readString(triplet.relation?.predicate) ??
      readString(triplet.relation?.canonical_predicate) ??
      'RELATED_TO';
    const key = `${source}|${predicate}|${target}`;

    if (!source || !target || seen.has(key)) continue;
    seen.add(key);
    relations.push({ source, predicate, target, context: readString(triplet.relation?.context) });
  }

  return relations;
};
