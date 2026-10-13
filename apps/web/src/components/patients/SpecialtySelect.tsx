import {
  MEDICAL_SPECIALTIES,
  MEDICAL_SPECIALTY_LABELS,
  type MedicalSpecialty,
} from '@docbrain/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const isMedicalSpecialty = (value: string): value is MedicalSpecialty =>
  (MEDICAL_SPECIALTIES as readonly string[]).includes(value);

interface SpecialtySelectProps {
  value: MedicalSpecialty | null;
  onValueChange: (value: MedicalSpecialty) => void;
  ariaLabel: string;
  placeholder?: string;
}

export const SpecialtySelect = ({
  value,
  onValueChange,
  ariaLabel,
  placeholder = 'Choose specialty',
}: SpecialtySelectProps) => (
  <Select
    value={value ?? undefined}
    onValueChange={(next) => {
      if (isMedicalSpecialty(next)) onValueChange(next);
    }}
  >
    <SelectTrigger className="w-48" aria-label={ariaLabel}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {MEDICAL_SPECIALTIES.map((specialty) => (
        <SelectItem key={specialty} value={specialty}>
          {MEDICAL_SPECIALTY_LABELS[specialty]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
