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

  /**
   * Only the caller's own appointments. Read from the raw query (`obj`), not
   * `value`: the global ValidationPipe uses implicit conversion, which turns
   * the string "false" into `true` before this transform runs.
   */
  @IsOptional()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => obj.mine === true || obj.mine === 'true',
  )
  @IsBoolean()
  mine?: boolean;
}
