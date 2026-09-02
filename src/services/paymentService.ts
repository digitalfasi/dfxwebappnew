import { apiClient } from '@/lib/apiClient';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'CHEQUE' | 'ONLINE';

interface BackendAdminPayment {
  id: string;
  tenant_id: string;
  enrollment_id: string;
  enrollment_number: string;
  customer_name: string;
  scheme_name: string;
  passbook_entry_id: string | null;
  payment_reference: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  payment_status: string;
  gateway_name: string | null;
  gateway_transaction_id: string | null;
  remarks: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface BackendCustomerPayment {
  id: string;
  enrollment_id: string;
  enrollment_number: string;
  scheme_name: string;
  payment_reference: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  payment_status: string;
  remarks: string | null;
}

export interface AdminPayment {
  id: string;
  enrollmentId: string;
  enrollmentNumber: string;
  customerName: string;
  schemeName: string;
  passbookEntryId: string | null;
  paymentReference: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  remarks: string | null;
  createdAt: string;
}

export interface CustomerPayment {
  id: string;
  enrollmentId: string;
  enrollmentNumber: string;
  schemeName: string;
  paymentReference: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  remarks: string | null;
}

export interface ManualPaymentFormData {
  enrollmentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  remarks?: string;
}

function mapAdminPayment(raw: BackendAdminPayment): AdminPayment {
  return {
    id: raw.id,
    enrollmentId: raw.enrollment_id,
    enrollmentNumber: raw.enrollment_number,
    customerName: raw.customer_name,
    schemeName: raw.scheme_name,
    passbookEntryId: raw.passbook_entry_id,
    paymentReference: raw.payment_reference,
    amount: raw.amount,
    paymentDate: raw.payment_date,
    paymentMethod: raw.payment_method as PaymentMethod,
    paymentStatus: raw.payment_status as PaymentStatus,
    remarks: raw.remarks,
    createdAt: raw.created_at,
  };
}

function mapCustomerPayment(raw: BackendCustomerPayment): CustomerPayment {
  return {
    id: raw.id,
    enrollmentId: raw.enrollment_id,
    enrollmentNumber: raw.enrollment_number,
    schemeName: raw.scheme_name,
    paymentReference: raw.payment_reference,
    amount: raw.amount,
    paymentDate: raw.payment_date,
    paymentMethod: raw.payment_method as PaymentMethod,
    paymentStatus: raw.payment_status as PaymentStatus,
    remarks: raw.remarks,
  };
}

export const paymentService = {
  /** GET /api/v1/payments (Admin) */
  async getAdminPayments(): Promise<AdminPayment[]> {
    const res = await apiClient.get<{ payments: BackendAdminPayment[] }>('/payments', { auth: true });
    return res.data.payments.map(mapAdminPayment);
  },

  /** GET /api/v1/payments/{id} (Admin) */
  async getAdminPaymentById(id: string): Promise<AdminPayment> {
    const res = await apiClient.get<{ payment: BackendAdminPayment }>(`/payments/${id}`, { auth: true });
    return mapAdminPayment(res.data.payment);
  },

  /** POST /api/v1/payments/manual (Admin) — records a payment collected outside the app. */
  async recordManualPayment(data: ManualPaymentFormData): Promise<AdminPayment> {
    const res = await apiClient.post<{ payment: BackendAdminPayment }>(
      '/payments/manual',
      {
        enrollment_id: data.enrollmentId,
        amount: data.amount,
        payment_method: data.paymentMethod,
        ...(data.paymentStatus !== undefined && { payment_status: data.paymentStatus }),
        ...(data.remarks !== undefined && { remarks: data.remarks }),
      },
      { auth: true }
    );
    return mapAdminPayment(res.data.payment);
  },

  /** PUT /api/v1/payments/{id} (Admin) */
  async updatePayment(id: string, data: Partial<Omit<ManualPaymentFormData, 'enrollmentId'>>): Promise<AdminPayment> {
    const res = await apiClient.put<{ payment: BackendAdminPayment }>(
      `/payments/${id}`,
      {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.paymentMethod !== undefined && { payment_method: data.paymentMethod }),
        ...(data.paymentStatus !== undefined && { payment_status: data.paymentStatus }),
        ...(data.remarks !== undefined && { remarks: data.remarks }),
      },
      { auth: true }
    );
    return mapAdminPayment(res.data.payment);
  },

  /** GET /api/v1/customer/payments — the caller's own payment history. Read-only. */
  async getMyPayments(): Promise<CustomerPayment[]> {
    const res = await apiClient.get<{ payments: BackendCustomerPayment[] }>('/customer/payments', { auth: true });
    return res.data.payments.map(mapCustomerPayment);
  },

  /** GET /api/v1/customer/payments/{id} — read-only. */
  async getMyPaymentById(id: string): Promise<CustomerPayment> {
    const res = await apiClient.get<{ payment: BackendCustomerPayment }>(`/customer/payments/${id}`, { auth: true });
    return mapCustomerPayment(res.data.payment);
  },
};
