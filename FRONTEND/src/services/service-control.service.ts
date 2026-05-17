import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

export type ServiceAction = 'start' | 'stop' | 'restart';

export interface ServiceActionResult {
  success: boolean;
  action: string;
  service: string;
  output: string;
}

class ServiceControlService {
  async executeAction(
    serverId: string,
    serviceName: string,
    action: ServiceAction,
  ): Promise<ServiceActionResult> {
    const response = await apiService.post<ServiceActionResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/services/${encodeURIComponent(serviceName)}/action`,
      { action },
    );
    const payload = (response as any)?.data ?? response;
    return ((payload as any)?.data ?? payload) as ServiceActionResult;
  }
}

export const serviceControlService = new ServiceControlService();
