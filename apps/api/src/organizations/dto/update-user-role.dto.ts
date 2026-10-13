import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrgRole } from '@docbrain/shared';

export class UpdateUserRoleDto {
  @IsNotEmpty()
  @IsEnum(OrgRole)
  role: OrgRole;
}
