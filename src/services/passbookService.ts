import { apiClient } from '@/lib/apiClient';

interface BackendPassbookEnrollment {
  id: string;
  enrollment_number: string;
  joined_date: string;
  status: string;
  maturity_date: string;
}

interface BackendPassbookScheme {
  id: string;
  name: string;
  monthly_amount: number;
  duration_months: number;
  bonus_description: string | null;
}

interface BackendPassbookEntry {
  id: string;
  entry_number: number;
  entry_date: string;
  description: string;
  amount: number;
  gold_rate: number;
  gold_weight: number;
  running_installment_count: number;
  remarks: string | null;
}

interface BackendPassbookSummary {
  total_amount_paid: number;
  total_gold_weight: number;
  entry_count: number;
}

interface BackendPassbook {
  enrollment: BackendPassbookEnrollment;
  scheme: BackendPassbookScheme;
  entries: BackendPassbookEntry[];
  summary: BackendPassbookSummary;
}

export interface PassbookEntry {
  id: string;
  entryNumber: number;
  entryDate: string;
  description: string;
  amount: number;
  goldRate: number;
  goldWeight: number;
  runningInstallmentCount: number;
  remarks: string | null;
}

export interface Passbook {
  enrollment: {
    id: string;
    enrollmentNumber: string;
    joinedDate: string;
    status: string;
    maturityDate: string;
  };
  scheme: {
    id: string;
    name: string;
    monthlyAmount: number;
    durationMonths: number;
    bonusDescription: string | null;
  };
  entries: PassbookEntry[];
  summary: {
    totalAmountPaid: number;
    totalGoldWeight: number;
    entryCount: number;
  };
}

function mapPassbook(raw: BackendPassbook): Passbook {
  return {
    enrollment: {
      id: raw.enrollment.id,
      enrollmentNumber: raw.enrollment.enrollment_number,
      joinedDate: raw.enrollment.joined_date,
      status: raw.enrollment.status,
      maturityDate: raw.enrollment.maturity_date,
    },
    scheme: {
      id: raw.scheme.id,
      name: raw.scheme.name,
      monthlyAmount: raw.scheme.monthly_amount,
      durationMonths: raw.scheme.duration_months,
      bonusDescription: raw.scheme.bonus_description,
    },
    entries: raw.entries.map((e) => ({
      id: e.id,
      entryNumber: e.entry_number,
      entryDate: e.entry_date,
      description: e.description,
      amount: e.amount,
      goldRate: e.gold_rate,
      goldWeight: e.gold_weight,
      runningInstallmentCount: e.running_installment_count,
      remarks: e.remarks,
    })),
    summary: {
      totalAmountPaid: raw.summary.total_amount_paid,
      totalGoldWeight: raw.summary.total_gold_weight,
      entryCount: raw.summary.entry_count,
    },
  };
}

export const passbookService = {
  /** GET /api/v1/customer/passbooks/{enrollmentId} — the caller's own passbook. */
  async getMyPassbook(enrollmentId: string): Promise<Passbook> {
    const res = await apiClient.get<{ passbook: BackendPassbook }>(`/customer/passbooks/${enrollmentId}`, { auth: true });
    return mapPassbook(res.data.passbook);
  },

  /** GET /api/v1/passbooks/{enrollmentId} (Admin, read-only) */
  async getAdminPassbook(enrollmentId: string): Promise<Passbook> {
    const res = await apiClient.get<{ passbook: BackendPassbook }>(`/passbooks/${enrollmentId}`, { auth: true });
    return mapPassbook(res.data.passbook);
  },
};
