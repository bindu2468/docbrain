import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPatientsQueryDto {
  /** Matches first name, last name, or MRN */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
