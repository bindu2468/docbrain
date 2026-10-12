import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

/**
 * The client sends the bounds of "today" in its own timezone, so the server
 * never has to guess which day the doctor means.
 */
export class ScheduleQueryDto {
  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;

  /** Only the caller's own appointments */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}
