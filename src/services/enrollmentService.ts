import { apiClient } from '@/lib/apiClient';

/** Shape of an `enrollment` object returned to admins — includes derived names. */
interface BackendAdminEnrollment {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  scheme_id: string;
  scheme_name: string;
  enrollment_number: string;
  joined_date: string;
  status: string;
  maturity_date: string;
  created_at: string;
  updated_at: string;
}

/** Shape of an `enrollment` object returned to the enrolled customer — lean. */
interface BackendCustomerEnrollment {
  id: string;
  scheme_id: string;
  scheme_name: string;
  enrollment_number: string;
  joined_date: string;
  status: string;
  maturity_date: string;
}

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface AdminEnrollment {
  id: string;
  customerId: string;
  customerName: string;
  schemeId: string;
  schemeName: string;
  enrollmentNumber: string;
  joinedDate: string;
  status: EnrollmentStatus;
  maturityDate: string;
}

export interface CustomerEnrollment {
  id: string;
  schemeId: string;
  schemeName: string;
  enrollmentNumber: string;
  joinedDate: string;
  status: EnrollmentStatus;
  maturityDate: string;
}

function mapAdminEnrollment(raw: BackendAdminEnrollment): AdminEnrollment {
  return {
    id: raw.id,
    customerId: raw.customer_id,
    customerName: raw.customer_name,
    schemeId: raw.scheme_id,
    schemeName: raw.scheme_name,
    enrollmentNumber: raw.enrollment_number,
    joinedDate: raw.joined_date,
    status: raw.status as EnrollmentStatus,
    maturityDate: raw.maturity_date,
  };
}

function mapCustomerEnrollment(raw: BackendCustomerEnrollment): CustomerEnrollment {
  return {
    id: raw.id,
    schemeId: raw.scheme_id,
    schemeName: raw.scheme_name,
    enrollmentNumber: raw.enrollment_number,
    joinedDate: raw.joined_date,
    status: raw.status as EnrollmentStatus,
    maturityDate: raw.maturity_date,
  };
}

export const enrollmentService = {
  /** GET /api/v1/enrollments (Admin, read-only) */
  async getAdminEnrollments(): Promise<AdminEnrollment[]> {
    const res = await apiClient.get<{ enrollments: BackendAdminEnrollment[] }>('/enrollments', { auth: true });
    return res.data.enrollments.map(mapAdminEnrollment);
  },

  /** POST /api/v1/customer/enrollments — enroll in an active scheme. */
  async enroll(schemeId: string): Promise<CustomerEnrollment> {
    const res = await apiClient.post<{ enrollment: BackendCustomerEnrollment }>(
      '/customer/enrollments',
      { scheme_id: schemeId },
      { auth: true }
    );
    return mapCustomerEnrollment(res.data.enrollment);
  },

  /** GET /api/v1/customer/enrollments — the caller's own enrollments. */
  async getMyEnrollments(): Promise<CustomerEnrollment[]> {
    const res = await apiClient.get<{ enrollments: BackendCustomerEnrollment[] }>('/customer/enrollments', { auth: true });
    return res.data.enrollments.map(mapCustomerEnrollment);
  },
};
