import { apiClient } from '@/lib/apiClient';
import { User } from '@/types';

/** Shape of the `profile` object returned by the FastAPI backend. */
interface BackendProfile {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  name: string;
  email: string | null;
  phone: string | null;
  kyc_status: string;
  member_since: string | null;
  avatar_url: string | null;
}

export interface CustomerProfile {
  id: string;
  tenantId: string | null;
  tenantName: string;
  name: string;
  email: string;
  phone: string;
  kycStatus: User['kycStatus'];
  memberSince: string;
  avatarUrl: string | null;
}

export interface UpdateProfileData {
  name?: string;
  email?: string;
  phone?: string;
}

const KYC_STATUSES: User['kycStatus'][] = ['Verified', 'Pending', 'Rejected'];

function mapProfile(raw: BackendProfile): CustomerProfile {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    tenantName: raw.tenant_name,
    name: raw.name,
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    kycStatus: KYC_STATUSES.find((s) => s === raw.kyc_status) ?? 'Pending',
    memberSince: raw.member_since ?? '',
    avatarUrl: raw.avatar_url,
  };
}

export type AddressType = 'Home' | 'Work' | 'Other';

/** Shape of an `address` object returned by the FastAPI backend. */
interface BackendAddress {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type: string;
  is_default: boolean;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type: AddressType;
  isDefault: boolean;
}

export interface AddressFormData {
  name: string;
  phone: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  type: AddressType;
  isDefault?: boolean;
}

const ADDRESS_TYPES: AddressType[] = ['Home', 'Work', 'Other'];

function mapAddress(raw: BackendAddress): Address {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    house: raw.house,
    street: raw.street,
    area: raw.area,
    city: raw.city,
    state: raw.state,
    pincode: raw.pincode,
    country: raw.country,
    type: ADDRESS_TYPES.find((t) => t === raw.type) ?? 'Home',
    isDefault: raw.is_default,
  };
}

function toBackendPayload(data: Partial<AddressFormData>) {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.house !== undefined && { house: data.house }),
    ...(data.street !== undefined && { street: data.street }),
    ...(data.area !== undefined && { area: data.area }),
    ...(data.city !== undefined && { city: data.city }),
    ...(data.state !== undefined && { state: data.state }),
    ...(data.pincode !== undefined && { pincode: data.pincode }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.isDefault !== undefined && { is_default: data.isDefault }),
  };
}

export type KYCDocType = 'PAN' | 'Aadhaar' | 'Passport';
export type KYCStatus = 'Pending' | 'Verified' | 'Rejected';

/** Shape of the `kyc` object returned by the FastAPI backend. */
interface BackendKYC {
  id: string;
  user_id: string;
  doc_type: string;
  doc_number: string;
  status: string;
  verified_at: string | null;
  rejection_reason: string | null;
}

export interface KYCRecord {
  id: string;
  docType: string;
  docNumber: string;
  status: KYCStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
}

export interface KYCSubmitData {
  docType: KYCDocType;
  docNumber: string;
}

const KYC_RECORD_STATUSES: KYCStatus[] = ['Pending', 'Verified', 'Rejected'];

function mapKYC(raw: BackendKYC): KYCRecord {
  return {
    id: raw.id,
    docType: raw.doc_type,
    docNumber: raw.doc_number,
    status: KYC_RECORD_STATUSES.find((s) => s === raw.status) ?? 'Pending',
    verifiedAt: raw.verified_at,
    rejectionReason: raw.rejection_reason,
  };
}

/** Shape of an admin-facing `kyc_record` object returned by the FastAPI backend. */
interface BackendAdminKYC {
  id: string;
  tenant_id: string;
  user_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  doc_type: string;
  doc_number: string;
  status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface AdminKYCRecord {
  id: string;
  tenantId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  docType: string;
  docNumber: string;
  status: KYCStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

function mapAdminKYC(raw: BackendAdminKYC): AdminKYCRecord {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    userId: raw.user_id,
    customerName: raw.customer_name,
    customerEmail: raw.customer_email ?? '',
    customerPhone: raw.customer_phone ?? '',
    docType: raw.doc_type,
    docNumber: raw.doc_number,
    status: KYC_RECORD_STATUSES.find((s) => s === raw.status) ?? 'Pending',
    verifiedAt: raw.verified_at,
    rejectionReason: raw.rejection_reason,
    createdAt: raw.created_at,
  };
}

/** Shape of a `branch` object returned by the FastAPI backend. */
interface BackendBranch {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  /** Google Maps link built from lat/lng — backend provides no separate URL field. */
  mapsUrl: string;
}

function mapBranch(raw: BackendBranch): Branch {
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address,
    phone: raw.phone,
    latitude: raw.latitude,
    longitude: raw.longitude,
    isActive: raw.is_active,
    mapsUrl: `https://www.google.com/maps?q=${raw.latitude},${raw.longitude}`,
  };
}

export const customerService = {
  /** GET /api/v1/customer/profile */
  async getProfile(): Promise<CustomerProfile> {
    const res = await apiClient.get<{ profile: BackendProfile }>('/customer/profile', { auth: true });
    return mapProfile(res.data.profile);
  },

  /** PUT /api/v1/customer/profile — only send fields the user actually changed. */
  async updateProfile(data: UpdateProfileData): Promise<CustomerProfile> {
    const res = await apiClient.put<{ profile: BackendProfile }>('/customer/profile', data, { auth: true });
    return mapProfile(res.data.profile);
  },

  /** GET /api/v1/customer/addresses */
  async getAddresses(): Promise<Address[]> {
    const res = await apiClient.get<{ addresses: BackendAddress[] }>('/customer/addresses', { auth: true });
    return res.data.addresses.map(mapAddress);
  },

  /** POST /api/v1/customer/addresses */
  async addAddress(data: AddressFormData): Promise<Address> {
    const res = await apiClient.post<{ address: BackendAddress }>(
      '/customer/addresses',
      toBackendPayload(data),
      { auth: true }
    );
    return mapAddress(res.data.address);
  },

  /** PUT /api/v1/customer/addresses/{id} */
  async updateAddress(id: string, data: Partial<AddressFormData>): Promise<Address> {
    const res = await apiClient.put<{ address: BackendAddress }>(
      `/customer/addresses/${id}`,
      toBackendPayload(data),
      { auth: true }
    );
    return mapAddress(res.data.address);
  },

  /** DELETE /api/v1/customer/addresses/{id} */
  async deleteAddress(id: string): Promise<void> {
    await apiClient.delete(`/customer/addresses/${id}`, { auth: true });
  },

  /** PUT /api/v1/customer/addresses/{id}/default */
  async setDefaultAddress(id: string): Promise<Address> {
    const res = await apiClient.put<{ address: BackendAddress }>(
      `/customer/addresses/${id}/default`,
      undefined,
      { auth: true }
    );
    return mapAddress(res.data.address);
  },

  /** GET /api/v1/customer/kyc — returns null if nothing has been submitted yet. */
  async getKYC(): Promise<KYCRecord | null> {
    const res = await apiClient.get<{ kyc: BackendKYC | null }>('/customer/kyc', { auth: true });
    return res.data.kyc ? mapKYC(res.data.kyc) : null;
  },

  /** POST /api/v1/customer/kyc */
  async submitKYC(data: KYCSubmitData): Promise<KYCRecord> {
    const res = await apiClient.post<{ kyc: BackendKYC }>(
      '/customer/kyc',
      { doc_type: data.docType, doc_number: data.docNumber },
      { auth: true }
    );
    return mapKYC(res.data.kyc);
  },

  /** GET /api/v1/kyc (Admin) */
  async getAdminKYCRecords(): Promise<AdminKYCRecord[]> {
    const res = await apiClient.get<{ kyc_records: BackendAdminKYC[] }>('/kyc', { auth: true });
    return res.data.kyc_records.map(mapAdminKYC);
  },

  /** GET /api/v1/kyc/{id} (Admin) */
  async getAdminKYCRecordById(id: string): Promise<AdminKYCRecord> {
    const res = await apiClient.get<{ kyc_record: BackendAdminKYC }>(`/kyc/${id}`, { auth: true });
    return mapAdminKYC(res.data.kyc_record);
  },

  /** PUT /api/v1/kyc/{id}/approve (Admin) */
  async approveKYC(id: string): Promise<AdminKYCRecord> {
    const res = await apiClient.put<{ kyc_record: BackendAdminKYC }>(`/kyc/${id}/approve`, undefined, { auth: true });
    return mapAdminKYC(res.data.kyc_record);
  },

  /** PUT /api/v1/kyc/{id}/reject (Admin) */
  async rejectKYC(id: string, reason: string): Promise<AdminKYCRecord> {
    const res = await apiClient.put<{ kyc_record: BackendAdminKYC }>(
      `/kyc/${id}/reject`,
      { reason },
      { auth: true }
    );
    return mapAdminKYC(res.data.kyc_record);
  },

  /** GET /api/v1/customer/branches */
  async getBranches(): Promise<Branch[]> {
    const res = await apiClient.get<{ branches: BackendBranch[] }>('/customer/branches', { auth: true });
    return res.data.branches.map(mapBranch);
  },
};
