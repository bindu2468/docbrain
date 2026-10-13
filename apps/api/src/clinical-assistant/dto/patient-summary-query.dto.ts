import { IsIn, IsOptional } from 'class-validator';
import { MEDICAL_SPECIALTIES, MedicalSpecialty } from '@docbrain/shared';

export class PatientSummaryQueryDto {
  /** Summarize through this specialty's lens instead of the caller's own */
  @IsOptional()
  @IsIn(MEDICAL_SPECIALTIES)
  specialty?: MedicalSpecialty;
}
