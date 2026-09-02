import { Tenant, TenantBranding, AuditLog } from '@/types';
import { MOCK_TENANTS, MOCK_AUDIT_LOGS } from '@/mock/mockData';
import { DEFAULT_BRANDING } from '@/constants';

export const tenantService = {
  async getTenants(): Promise<Tenant[]> {
    return MOCK_TENANTS;
  },

  async getBranding(tenantId?: string): Promise<TenantBranding> {
    const tenant = MOCK_TENANTS.find((t) => t.id === tenantId);
    return tenant ? tenant.branding : DEFAULT_BRANDING;
  },

  async createTenant(newTenant: Omit<Tenant, 'id' | 'branding' | 'dueDate' | 'status'>): Promise<Tenant> {
    const created: Tenant = {
      ...newTenant,
      id: `tnt_${Date.now()}`,
      status: newTenant.plan === 'Trial' ? 'Trial' : 'Active',
      dueDate: '15 Aug 2025',
      branding: {
        ...DEFAULT_BRANDING,
        brandName: newTenant.name,
      },
    };
    MOCK_TENANTS.push(created);

    MOCK_AUDIT_LOGS.unshift({
      id: `log_${Date.now()}`,
      actorName: 'Super Admin',
      actorRole: 'superadmin',
      action: `Created new tenant (${newTenant.plan} plan)`,
      target: newTenant.name,
      timestamp: 'Just now',
    });

    return created;
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    return MOCK_AUDIT_LOGS;
  },
};
