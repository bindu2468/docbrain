import { IsIn, ValidateIf } from 'class-validator';
import { MEDICAL_SPECIALTIES, MedicalSpecialty } from '@docbrain/shared';

export class UpdateClinicianProfileDto {
  /** Null clears the specialty, for non-clinical staff */
  @ValidateIf((_, value) => value !== null)
  @IsIn(MEDICAL_SPECIALTIES)
  specialty: MedicalSpecialty | null;
}
