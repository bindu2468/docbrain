import type {
  AssistantAnswerRequest,
  AssistantAnswerResponse,
  AssistantConfigResponse,
  MedicalSpecialty,
  PatientSummaryResponse,
} from '@docbrain/shared';
import { apiClient } from './api-client';

/** Clinical assistant API: model-written answers and summaries, with citations. */
export class ClinicalAssistantApi {
  async getConfig(organizationId: string): Promise<AssistantConfigResponse> {
    return apiClient.get<AssistantConfigResponse>(
      `/api/organizations/${organizationId}/assistant/config`,
    );
  }

  async answer(
    organizationId: string,
    patientId: string,
    data: AssistantAnswerRequest,
  ): Promise<AssistantAnswerResponse> {
    return apiClient.post<AssistantAnswerResponse>(
      `/api/organizations/${organizationId}/patients/${patientId}/assistant/answer`,
      data,
    );
  }

  async getSummary(
    organizationId: string,
    patientId: string,
    specialty?: MedicalSpecialty,
  ): Promise<PatientSummaryResponse> {
    const query = specialty ? `?${new URLSearchParams({ specialty })}` : '';
    return apiClient.get<PatientSummaryResponse>(
      `/api/organizations/${organizationId}/patients/${patientId}/assistant/summary${query}`,
    );
  }
}

export const clinicalAssistantApi = new ClinicalAssistantApi();
