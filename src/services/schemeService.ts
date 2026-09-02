import { apiClient } from '@/lib/apiClient';

/** Shape of a `scheme` object returned by the FastAPI backend (Admin view). */
interface BackendScheme {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  monthly_amount: number;
  duration_months: number;
  bonus_description: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Shape of a `scheme` object returned to customers — active-only, no internal IDs. */
interface BackendCustomerScheme {
  id: string;
  name: string;
  description: string | null;
  monthly_amount: number;
  duration_months: number;
  bonus_description: string | null;
}

export interface AdminScheme {
  id: string;
  name: string;
  description: string;
  monthlyAmount: number;
  durationMonths: number;
  bonusDescription: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerScheme {
  id: string;
  name: string;
  description: string;
  monthlyAmount: number;
  durationMonths: number;
  bonusDescription: string;
}

export interface SchemeFormData {
  name: string;
  description?: string;
  monthlyAmount: number;
  durationMonths: number;
  bonusDescription?: string;
  isActive?: boolean;
}

function mapAdminScheme(raw: BackendScheme): AdminScheme {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    bonusDescription: raw.bonus_description ?? '',
    isActive: raw.is_active,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function mapCustomerScheme(raw: BackendCustomerScheme): CustomerScheme {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    bonusDescription: raw.bonus_description ?? '',
  };
}

function toBackendPayload(data: Partial<SchemeFormData>) {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.monthlyAmount !== undefined && { monthly_amount: data.monthlyAmount }),
    ...(data.durationMonths !== undefined && { duration_months: data.durationMonths }),
    ...(data.bonusDescription !== undefined && { bonus_description: data.bonusDescription }),
    ...(data.isActive !== undefined && { is_active: data.isActive }),
  };
}

export const schemeService = {
  /** GET /api/v1/schemes (Admin) — all schemes, active + inactive. */
  async getAdminSchemes(): Promise<AdminScheme[]> {
    const res = await apiClient.get<{ schemes: BackendScheme[] }>('/schemes', { auth: true });
    return res.data.schemes.map(mapAdminScheme);
  },

  /** GET /api/v1/schemes/{id} (Admin) */
  async getSchemeById(id: string): Promise<AdminScheme> {
    const res = await apiClient.get<{ scheme: BackendScheme }>(`/schemes/${id}`, { auth: true });
    return mapAdminScheme(res.data.scheme);
  },

  /** POST /api/v1/schemes (Admin) */
  async createScheme(data: SchemeFormData): Promise<AdminScheme> {
    const res = await apiClient.post<{ scheme: BackendScheme }>('/schemes', toBackendPayload(data), { auth: true });
    return mapAdminScheme(res.data.scheme);
  },

  /** PUT /api/v1/schemes/{id} (Admin) — partial update, can also reactivate via isActive: true. */
  async updateScheme(id: string, data: Partial<SchemeFormData>): Promise<AdminScheme> {
    const res = await apiClient.put<{ scheme: BackendScheme }>(`/schemes/${id}`, toBackendPayload(data), { auth: true });
    return mapAdminScheme(res.data.scheme);
  },

  /** DELETE /api/v1/schemes/{id} (Admin) — soft delete (sets is_active=false, row is preserved). */
  async deactivateScheme(id: string): Promise<void> {
    await apiClient.delete(`/schemes/${id}`, { auth: true });
  },

  /** GET /api/v1/customer/schemes — active-only, read-only. */
  async getCustomerSchemes(): Promise<CustomerScheme[]> {
    const res = await apiClient.get<{ schemes: BackendCustomerScheme[] }>('/customer/schemes', { auth: true });
    return res.data.schemes.map(mapCustomerScheme);
  },
};
