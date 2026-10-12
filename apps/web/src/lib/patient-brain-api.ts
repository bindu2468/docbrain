import type {
  BrainQueryRequest,
  BrainQueryResponse,
  BrainStatusResponse,
  BrainSyncResponse,
} from '@app-starter/shared';
import { apiClient } from './api-client';

/** Patient brain (HydraDB) API, scoped to one patient. */
export class PatientBrainApi {
  private base(organizationId: string, patientId: string): string {
    return `/api/organizations/${organizationId}/patients/${patientId}/brain`;
  }

  async getStatus(organizationId: string, patientId: string): Promise<BrainStatusResponse> {
    return apiClient.get<BrainStatusResponse>(`${this.base(organizationId, patientId)}/status`);
  }

  async sync(organizationId: string, patientId: string): Promise<BrainSyncResponse> {
    return apiClient.post<BrainSyncResponse>(`${this.base(organizationId, patientId)}/sync`, {});
  }

  async query(
    organizationId: string,
    patientId: string,
    data: BrainQueryRequest,
  ): Promise<BrainQueryResponse> {
    return apiClient.post<BrainQueryResponse>(
      `${this.base(organizationId, patientId)}/query`,
      data,
    );
  }
}

export const patientBrainApi = new PatientBrainApi();
