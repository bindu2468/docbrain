import type {
  ClinicianProfileResponse,
  MedicalSpecialty,
  PatientBriefResponse,
  PatientListResponse,
  PatientRecordResponse,
  ScheduleResponse,
  UpdateClinicianProfileRequest,
} from '@docbrain/shared';
import { apiClient } from './api-client';

/** Patient Brain API. Types come from `@docbrain/shared` so both apps agree. */
export class PatientsApi {
  async list(organizationId: string, search?: string): Promise<PatientListResponse> {
    const query = search ? `?${new URLSearchParams({ search })}` : '';
    return apiClient.get<PatientListResponse>(
      `/api/organizations/${organizationId}/patients${query}`,
    );
  }

  async getRecord(organizationId: string, patientId: string): Promise<PatientRecordResponse> {
    return apiClient.get<PatientRecordResponse>(
      `/api/organizations/${organizationId}/patients/${patientId}`,
    );
  }

  async getBrief(
    organizationId: string,
    patientId: string,
    specialty?: MedicalSpecialty,
  ): Promise<PatientBriefResponse> {
    const query = specialty ? `?${new URLSearchParams({ specialty })}` : '';
    return apiClient.get<PatientBriefResponse>(
      `/api/organizations/${organizationId}/patients/${patientId}/brief${query}`,
    );
  }

  /** Appointments in [from, to). Pass the local day's bounds for "today". */
  async getSchedule(
    organizationId: string,
    from: Date,
    to: Date,
    isMineOnly: boolean,
  ): Promise<ScheduleResponse> {
    const query = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      mine: String(isMineOnly),
    });
    return apiClient.get<ScheduleResponse>(
      `/api/organizations/${organizationId}/schedule?${query}`,
    );
  }

  async getClinicianProfile(organizationId: string): Promise<ClinicianProfileResponse> {
    return apiClient.get<ClinicianProfileResponse>(
      `/api/organizations/${organizationId}/clinicians/me`,
    );
  }

  async updateClinicianProfile(
    organizationId: string,
    data: UpdateClinicianProfileRequest,
  ): Promise<ClinicianProfileResponse> {
    return apiClient.patch<ClinicianProfileResponse>(
      `/api/organizations/${organizationId}/clinicians/me`,
      data,
    );
  }
}

export const patientsApi = new PatientsApi();
