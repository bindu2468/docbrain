import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HydraDBClient, HydraDBError } from '@hydradb/sdk';
import { HydraDbGateway } from './hydra-db.gateway';
import { BrainKnowledgeItem } from './brain-documents';

jest.mock('@hydradb/sdk', () => {
  const actual = jest.requireActual('@hydradb/sdk');
  return { ...actual, HydraDBClient: jest.fn() };
});

describe('HydraDbGateway', () => {
  let mockClient: any;

  const buildConfig = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  const buildItem = (id: string): BrainKnowledgeItem => ({
    id,
    title: id,
    kind: 'custom',
    provider: 'patient-brain',
    external_id: id,
    timestamp: '2026-01-01T00:00:00.000Z',
    fields: { kind: 'custom', body: id, data: { record_type: 'medication' } },
    additional_metadata: { record_type: 'MEDICATION', record_id: id },
    acl: ['group:clinic:org-1'],
  });

  beforeEach(() => {
    mockClient = {
      databases: {
        create: jest.fn().mockResolvedValue({}),
        status: jest.fn().mockResolvedValue({ data: { infra: { readyForIngestion: true } } }),
      },
      context: {
        ingest: jest.fn().mockResolvedValue({ data: { results: [] } }),
        status: jest.fn().mockResolvedValue({ data: { statuses: [] } }),
        delete: jest.fn().mockResolvedValue({}),
      },
      query: jest.fn(),
    };
    (HydraDBClient as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('is disabled and refuses calls when no API key is configured', async () => {
    // Arrange
    const gateway = new HydraDbGateway(buildConfig({}));

    // Act
    const actual = gateway.deleteItems('c', ['x']);

    // Assert
    expect(gateway.isEnabled).toBe(false);
    await expect(actual).rejects.toThrow(ServiceUnavailableException);
  });

  it('treats an existing database as ready to use', async () => {
    mockClient.databases.create.mockRejectedValue(
      new HydraDBError({ message: 'exists', statusCode: 409 }),
    );
    const gateway = new HydraDbGateway(buildConfig({ HYDRA_DB_API_KEY: 'key' }));

    await expect(gateway.ensureDatabaseReady()).resolves.toBeUndefined();
  });

  it('sends each batch only the graph entries for its own items', async () => {
    const gateway = new HydraDbGateway(
      buildConfig({ HYDRA_DB_API_KEY: 'key', HYDRA_DB_DATABASE: 'db' }),
    );
    const inputItems = Array.from({ length: 30 }, (_, index) => buildItem(`item_${index}`));
    const inputGraph = {
      item_0: { entities: {}, relations: [] },
      item_29: { entities: {}, relations: [] },
    };

    await gateway.ingestKnowledge('c', inputItems, inputGraph);

    const [firstCall, secondCall] = mockClient.context.ingest.mock.calls.map(
      ([request]: any[]) => request,
    );
    expect(JSON.parse(firstCall.appKnowledge)).toHaveLength(25);
    expect(Object.keys(JSON.parse(firstCall.graphPayload))).toEqual(['item_0']);
    expect(Object.keys(JSON.parse(secondCall.graphPayload))).toEqual(['item_29']);
    expect(firstCall).toMatchObject({ database: 'db', collection: 'c', type: 'knowledge' });
  });

  it('treats deleting an item that is already gone as success', async () => {
    mockClient.context.delete.mockRejectedValue(
      new HydraDBError({ message: 'gone', statusCode: 404 }),
    );
    const gateway = new HydraDbGateway(buildConfig({ HYDRA_DB_API_KEY: 'key' }));

    await expect(gateway.deleteItems('c', ['x'])).resolves.toEqual([]);
  });

  it('reports items HydraDB declined to delete', async () => {
    mockClient.context.delete.mockResolvedValue({
      data: {
        results: [
          { id: 'a', deleted: true },
          { id: 'b', deleted: false },
        ],
      },
    });
    const gateway = new HydraDbGateway(buildConfig({ HYDRA_DB_API_KEY: 'key' }));

    await expect(gateway.deleteItems('c', ['a', 'b'])).resolves.toEqual(['b']);
  });

  it('maps HydraDB indexing statuses onto searchable, pending, and failed', async () => {
    // Arrange
    mockClient.context.status.mockResolvedValue({
      data: {
        statuses: [
          { id: 'a', indexingStatus: 'graph_creation' },
          { id: 'b', indexingStatus: 'processing' },
          { id: 'c', indexingStatus: 'errored' },
        ],
      },
    });
    const gateway = new HydraDbGateway(buildConfig({ HYDRA_DB_API_KEY: 'key' }));

    // Act
    const actualStates = await gateway.getIndexingStates('c', ['a', 'b', 'c']);

    // Assert
    expect(Object.fromEntries(actualStates)).toEqual({
      a: 'searchable',
      b: 'pending',
      c: 'failed',
    });
    // One comma-joined value — the SDK's array form is rejected by the server
    expect(mockClient.context.status.mock.calls[0][0].ids).toBe('a,b,c');
  });

  it('hides upstream error bodies behind a 503', async () => {
    mockClient.query.mockRejectedValue(
      new HydraDBError({
        message: 'boom',
        statusCode: 500,
        body: { error: { code: 'INTERNAL_ERROR' } },
      }),
    );
    const gateway = new HydraDbGateway(buildConfig({ HYDRA_DB_API_KEY: 'key' }));

    const actual = gateway.query({ collection: 'c', question: 'q', acl: [], maxResults: 5 });

    await expect(actual).rejects.toThrow(ServiceUnavailableException);
  });
});
