import { apiClient } from '@/lib/apiClient';
import { ExportFile, ExportFormat, BackendExportFile, mapExportFile } from '@/lib/exportDownload';

interface BackendAuditLogItem {
  id: string;
  tenant_id: string | null;
  actor_user_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  target_entity: string;
  target_id: string | null;
  before_state: string | null;
  after_state: string | null;
  created_at: string;
}

interface BackendPagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

interface BackendAuditLogListResponse {
  logs: BackendAuditLogItem[];
  pagination: BackendPagination;
}

export interface AuditLogItem {
  id: string;
  tenantId: string | null;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  beforeState: string | null;
  afterState: string | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AuditLogListParams {
  tenantId?: string;
  actorRole?: string;
  targetEntity?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/** Same structured filters as the list view — no free-text `search`, since
 * the backend has no full-text search endpoint (see SESSION_HANDOFF.md
 * Module 14 — the page's search box only filters its already-loaded rows). */
export interface AuditLogExportParams {
  tenantId?: string;
  actorRole?: string;
  targetEntity?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  format?: ExportFormat;
}

export interface AuditLogListResult {
  logs: AuditLogItem[];
  pagination: Pagination;
}

function mapAuditLog(raw: BackendAuditLogItem): AuditLogItem {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    actorUserId: raw.actor_user_id,
    actorName: raw.actor_name,
    actorRole: raw.actor_role,
    action: raw.action,
    targetEntity: raw.target_entity,
    targetId: raw.target_id,
    beforeState: raw.before_state,
    afterState: raw.after_state,
    createdAt: raw.created_at,
  };
}

function buildQuery(params: AuditLogListParams | AuditLogExportParams): string {
  const qs = new URLSearchParams();
  if (params.tenantId) qs.set('tenant_id', params.tenantId);
  if (params.actorRole) qs.set('actor_role', params.actorRole);
  if (params.targetEntity) qs.set('target_entity', params.targetEntity);
  if (params.action) qs.set('action', params.action);
  if (params.dateFrom) qs.set('date_from', params.dateFrom);
  if (params.dateTo) qs.set('date_to', params.dateTo);
  if ('page' in params && params.page) qs.set('page', String(params.page));
  if ('pageSize' in params && params.pageSize) qs.set('page_size', String(params.pageSize));
  if ('format' in params && params.format) qs.set('format', params.format);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const auditService = {
  /** GET /api/v1/audit-logs (SuperAdmin) — paginated, filterable. */
  async getAuditLogs(params: AuditLogListParams = {}): Promise<AuditLogListResult> {
    const res = await apiClient.get<{ audit_logs: BackendAuditLogListResponse }>(
      `/audit-logs${buildQuery(params)}`,
      { auth: true }
    );
    const raw = res.data.audit_logs;
    return {
      logs: raw.logs.map(mapAuditLog),
      pagination: {
        page: raw.pagination.page,
        pageSize: raw.pagination.page_size,
        totalItems: raw.pagination.total_items,
        totalPages: raw.pagination.total_pages,
      },
    };
  },

  /** GET /api/v1/audit-logs/export (SuperAdmin) — Module 15. Pass the result
   * to triggerExportDownload() from '@/lib/exportDownload'. */
  async exportAuditLogs(params: AuditLogExportParams = {}): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/audit-logs/export${buildQuery(params)}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },
};
