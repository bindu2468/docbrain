import { OrgRole } from '@docbrain/shared';

export interface AcceptInviteResponseDto {
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  };
  role: OrgRole;
  message: string;
}
