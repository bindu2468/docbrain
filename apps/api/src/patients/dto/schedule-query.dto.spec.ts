import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { ScheduleQueryDto } from './schedule-query.dto';

describe('ScheduleQueryDto', () => {
  // Mirrors the global ValidationPipe in main.ts, where the bug lived
  const parse = (query: Record<string, string>) =>
    plainToInstance(ScheduleQueryDto, query, { enableImplicitConversion: true });

  const inputBounds = { from: '2026-10-12T07:00:00.000Z', to: '2026-10-13T07:00:00.000Z' };

  it('reads mine=false as false, not as a truthy string', () => {
    // Act
    const actualQuery = parse({ ...inputBounds, mine: 'false' });

    // Assert
    expect(actualQuery.mine).toBe(false);
  });

  it('reads mine=true as true', () => {
    expect(parse({ ...inputBounds, mine: 'true' }).mine).toBe(true);
  });
});
