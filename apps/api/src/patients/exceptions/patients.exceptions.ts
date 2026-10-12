import { ForbiddenException, NotFoundException } from '@nestjs/common';

export class PatientNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super(`Patient not found: ${identifier}`);
  }
}

export class PatientAccessDeniedException extends ForbiddenException {
  constructor(action: string) {
    super(`You do not have permission to ${action} this organization`);
  }
}
