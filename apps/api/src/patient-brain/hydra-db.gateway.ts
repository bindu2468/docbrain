import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HydraDB, HydraDBClient, HydraDBError } from '@hydradb/sdk';
import { BrainKnowledgeItem, SourceGraph } from './brain-documents';

/** HydraDB caps how much one request may carry; stay well inside it. */
const INGEST_BATCH_SIZE = 25;
const STATUS_BATCH_SIZE = 50;

const DATABASE_READY_TIMEOUT_MS = 90_000;
const DATABASE_POLL_INTERVAL_MS = 3_000;

export type IndexingState = 'searchable' | 'pending' | 'failed';

export interface BrainQueryOptions {
  collection: string;
  question: string;
  acl: string[];
  maxResults: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The only place the API talks to HydraDB.
 *
 * Optional by design: with no `HYDRA_DB_API_KEY` the gateway reports itself
 * disabled and the rest of the app — including the pre-visit brief — works
 * exactly as before. The brain is an addition, never a dependency of the
 * safety-critical screens.
 */
@Injectable()
export class HydraDbGateway {
  private readonly logger = new Logger(HydraDbGateway.name);
  private readonly client: HydraDBClient | null;
  private readonly database: string;
  private databaseReady: Promise<void> | null = null;

  constructor(configService: ConfigService) {
    const token = configService.get<string>('HYDRA_DB_API_KEY');
    this.database = configService.get<string>('HYDRA_DB_DATABASE') ?? 'patient_brain_dev';
    this.client = token ? new HydraDBClient({ token, timeoutInSeconds: 60 }) : null;
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Create the database on first use and wait until it accepts data. Memoized,
   * so concurrent syncs share one provisioning wait; reset on failure so the
   * next call retries.
   */
  async ensureDatabaseReady(): Promise<void> {
    this.databaseReady ??= this.provisionDatabase().catch((error: unknown) => {
      this.databaseReady = null;
      throw error;
    });
    return this.databaseReady;
  }

  /**
   * Delete individual items, so records removed from Postgres do not linger.
   * Returns the ids HydraDB declined to delete — it refuses while a source is
   * still indexing — so the caller can retry them on the next sync.
   *
   * Deliberately not `databases.deleteCollection`: collection deletion is
   * asynchronous upstream, and the collection rejects every write ("is being
   * deleted") until cleanup finishes — so delete-then-rebuild fails.
   */
  async deleteItems(collection: string, ids: readonly string[]): Promise<string[]> {
    const client = this.requireClient();
    const notDeleted: string[] = [];

    for (let start = 0; start < ids.length; start += STATUS_BATCH_SIZE) {
      const batch = ids.slice(start, start + STATUS_BATCH_SIZE);
      try {
        const response = await client.context.delete({
          type: 'knowledge',
          database: this.database,
          collection,
          ids: batch,
        });
        // A 200 can still carry per-item refusals
        for (const result of response.data?.results ?? []) {
          if (result.id && result.deleted === false) notDeleted.push(result.id);
        }
      } catch (error) {
        // Already gone is the outcome we wanted
        if (error instanceof HydraDBError && error.statusCode === 404) continue;
        throw this.translate(error, 'remove outdated records');
      }
    }

    return notDeleted;
  }

  async ingestKnowledge(
    collection: string,
    items: readonly BrainKnowledgeItem[],
    graphPayload: Readonly<Record<string, SourceGraph>>,
  ): Promise<void> {
    const client = this.requireClient();

    for (let start = 0; start < items.length; start += INGEST_BATCH_SIZE) {
      const batch = items.slice(start, start + INGEST_BATCH_SIZE);
      // A graph_payload key with no matching item in the same request is a 400
      const batchGraph = Object.fromEntries(
        batch.filter(({ id }) => graphPayload[id]).map(({ id }) => [id, graphPayload[id]]),
      );

      try {
        const response = await client.context.ingest({
          type: 'knowledge',
          database: this.database,
          collection,
          upsert: 'true',
          appKnowledge: JSON.stringify(batch),
          ...(Object.keys(batchGraph).length > 0
            ? { graphPayload: JSON.stringify(batchGraph) }
            : {}),
        });

        const failures = response.data?.results?.filter(({ error }) => Boolean(error)) ?? [];
        if (failures.length > 0) {
          this.logger.warn(
            `HydraDB rejected ${failures.length} item(s) in ${collection}: ${failures
              .map(({ id, errorCode, error }) => `${id} ${errorCode ?? ''} ${error ?? ''}`.trim())
              .join('; ')}`,
          );
        }
      } catch (error) {
        throw this.translate(error, 'ingest records');
      }
    }
  }

  /** Indexing state per item id. Ids HydraDB does not know read as failed. */
  /**
   * Indexing state per item id. Ids HydraDB does not know read as failed.
   *
   * `ids` is sent as one comma-joined string (the endpoint accepts
   * `?ids=a,b`): SDK 2.1.7 serializes an array as `ids[0]=…&ids[1]=…`, which
   * the server rejects with "At least one source ID is required".
   */
  async getIndexingStates(
    collection: string,
    ids: readonly string[],
  ): Promise<Map<string, IndexingState>> {
    const client = this.requireClient();
    const states = new Map<string, IndexingState>();

    for (let start = 0; start < ids.length; start += STATUS_BATCH_SIZE) {
      try {
        const response = await client.context.status({
          database: this.database,
          collection,
          ids: ids.slice(start, start + STATUS_BATCH_SIZE).join(','),
        });
        for (const status of response.data?.statuses ?? []) {
          if (status.id) states.set(status.id, toIndexingState(status.indexingStatus));
        }
      } catch (error) {
        throw this.translate(error, 'check indexing status');
      }
    }

    return states;
  }

  async query({
    collection,
    question,
    acl,
    maxResults,
  }: BrainQueryOptions): Promise<HydraDB.SearchV2RetrievalResult> {
    const client = this.requireClient();

    try {
      const response = await client.query({
        database: this.database,
        collection,
        query: question,
        type: 'knowledge',
        queryBy: 'hybrid',
        // Thinking mode follows the declared relations and the graph, which
        // is what answers "why" rather than "what"
        mode: 'thinking',
        graphContext: true,
        queryForcefulRelations: true,
        maxResults,
        acl,
      });

      const data = response.data;
      if (!data || typeof data === 'string') {
        throw new ServiceUnavailableException('The patient brain returned an unexpected response.');
      }
      return data;
    } catch (error) {
      throw this.translate(error, 'query');
    }
  }

  private async provisionDatabase(): Promise<void> {
    const client = this.requireClient();

    try {
      await client.databases.create({ database: this.database });
      this.logger.log(`Created HydraDB database "${this.database}"`);
    } catch (error) {
      // Already exists is the normal case after the first run
      if (!(error instanceof HydraDBError && error.statusCode === 409)) {
        throw this.translate(error, 'create database');
      }
    }

    const deadline = Date.now() + DATABASE_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const status = await client.databases.status({ database: this.database });
      if (status.data?.infra?.readyForIngestion) return;
      await sleep(DATABASE_POLL_INTERVAL_MS);
    }

    throw new ServiceUnavailableException(
      `HydraDB database "${this.database}" is still provisioning. Try again in a minute.`,
    );
  }

  private requireClient(): HydraDBClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'The patient brain is not configured. Set HYDRA_DB_API_KEY in apps/api/.env.',
      );
    }
    return this.client;
  }

  /**
   * Log the HydraDB request id (their support needs it) and surface a 503
   * without leaking the upstream body to the browser.
   */
  private translate(error: unknown, action: string): Error {
    if (error instanceof ServiceUnavailableException) return error;

    if (error instanceof HydraDBError) {
      const body = error.body as
        | {
            error?: { code?: string; message?: string };
            meta?: { request_id?: string };
            detail?: unknown;
          }
        | undefined;
      // The message names the offending field; it never echoes the API key
      const message = body?.error?.message ?? JSON.stringify(body?.detail ?? '').slice(0, 500);
      this.logger.error(
        `HydraDB ${action} failed: ${error.statusCode ?? '?'} ${body?.error?.code ?? ''} ${message} request_id=${body?.meta?.request_id ?? 'n/a'}`,
      );
    } else {
      this.logger.error(
        `HydraDB ${action} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return new ServiceUnavailableException(
      `The patient brain could not ${action}. Try again shortly.`,
    );
  }
}

const toIndexingState = (status: string | undefined): IndexingState => {
  if (status === 'completed' || status === 'graph_creation') return 'searchable';
  if (status === 'queued' || status === 'processing') return 'pending';
  return 'failed';
};
