import { IsIn, IsOptional } from 'class-validator';
import { MEDICAL_SPECIALTIES, MedicalSpecialty } from '@docbrain/shared';

export class PatientBriefQueryDto {
  /**
   * Read the brief through another specialty's lens. Defaults to the caller's
   * own specialty.
   */
  @IsOptional()
  @IsIn(MEDICAL_SPECIALTIES)
  specialty?: MedicalSpecialty;
}
