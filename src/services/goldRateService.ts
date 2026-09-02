import { apiClient } from '@/lib/apiClient';

/** Shape of a `rate` object returned by the FastAPI backend (Admin view). */
interface BackendGoldRate {
  id: string;
  tenant_id: string;
  rate_24k: number;
  effective_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Shape of the `rate` object returned to customers — no internal IDs. */
interface BackendCustomerGoldRate {
  rate_24k: number;
  effective_date: string;
  updated_at: string;
}

export interface GoldRate {
  id: string;
  rate24k: number;
  effectiveDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerGoldRate {
  rate24k: number;
  effectiveDate: string;
  updatedAt: string;
}

function mapRate(raw: BackendGoldRate): GoldRate {
  return {
    id: raw.id,
    rate24k: raw.rate_24k,
    effectiveDate: raw.effective_date,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function mapCustomerRate(raw: BackendCustomerGoldRate): CustomerGoldRate {
  return {
    rate24k: raw.rate_24k,
    effectiveDate: raw.effective_date,
    updatedAt: raw.updated_at,
  };
}

export const goldRateService = {
  /** GET /api/v1/gold-rates/today (Admin) — null if not yet set today. */
  async getTodayRateAdmin(): Promise<GoldRate | null> {
    const res = await apiClient.get<{ rate: BackendGoldRate | null }>('/gold-rates/today', { auth: true });
    return res.data.rate ? mapRate(res.data.rate) : null;
  },

  /** POST /api/v1/gold-rates/today (Admin) — fails if today's rate already exists. */
  async createTodayRate(rate24k: number): Promise<GoldRate> {
    const res = await apiClient.post<{ rate: BackendGoldRate }>(
      '/gold-rates/today',
      { rate_24k: rate24k },
      { auth: true }
    );
    return mapRate(res.data.rate);
  },

  /** PUT /api/v1/gold-rates/today (Admin) — fails if today's rate isn't set yet. */
  async updateTodayRate(rate24k: number): Promise<GoldRate> {
    const res = await apiClient.put<{ rate: BackendGoldRate }>(
      '/gold-rates/today',
      { rate_24k: rate24k },
      { auth: true }
    );
    return mapRate(res.data.rate);
  },

  /** GET /api/v1/customer/gold-rate — null if not yet set today. */
  async getCustomerRate(): Promise<CustomerGoldRate | null> {
    const res = await apiClient.get<{ rate: BackendCustomerGoldRate | null }>('/customer/gold-rate', { auth: true });
    return res.data.rate ? mapCustomerRate(res.data.rate) : null;
  },
};
