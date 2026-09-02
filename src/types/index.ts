export type UserRole = 'customer' | 'admin' | 'superadmin';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  tenantId?: string;
  kycStatus: 'Verified' | 'Pending' | 'Rejected';
  memberSince: string;
  avatarUrl?: string;
}

export interface TenantBranding {
  brandName: string;
  brandColor: string;
  fontFamily: string;
  logoText: string;
  tagline: string;
}

export interface Tenant {
  id: string;
  name: string;
  city: string;
  contact: string;
  plan: 'Trial' | 'Professional' | 'Business';
  status: 'Active' | 'Trial' | 'Expired' | 'Cancelled';
  dueDate: string;
  branding: TenantBranding;
}

export interface GoldRate {
  price24k: number;
  price22k: number;
  price18k: number;
  change24h: number;
  up: boolean;
  history: number[];
}

export interface SilverRate {
  price999: number;
  price925: number;
  change24h: number;
  up: boolean;
  history: number[];
}

export interface Scheme {
  id: string;
  name: string;
  type: 'Monthly' | 'Flexible';
  tenureMonths: number;
  minAmount: number;
  bonusPercent: number;
  status: 'Active' | 'Inactive';
  description?: string;
}

export interface SchemeEnrollment {
  id: string;
  schemeId: string;
  schemeName: string;
  userId: string;
  totalPaid: number;
  accumulatedWeightGrams: number;
  targetWeightGrams: number;
  installmentsPaid: number;
  totalInstallments: number;
  nextDueDate: string;
  nextAmount: number;
  maturityDate: string;
  autoPay: boolean;
  reminderEnabled: boolean;
  status: 'Active' | 'Matured' | 'Overdue';
}

export interface PassbookEntry {
  id: string;
  date: string;
  amountPaid: number;
  gstAmount: number;
  netAmount: number;
  goldRate: number;
  weightGrams: number;
  status: 'Payment Successful' | 'Processing' | 'Failed';
  paymentMethod: string;
  source: 'app' | 'manual';
  referenceNo: string;
}

export interface Product {
  id: string;
  name: string;
  category: 'Necklace' | 'Necklaces' | 'Earrings' | 'Rings' | 'Bangles' | 'Bracelets';
  weightGrams: number;
  price: number;
  icon: string;
  imageUrl?: string;
  isBestSeller?: boolean;
  stock?: number;
  description?: string;
  purity?: string;
  sku?: string;
  hallmark?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  distanceKm: number;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export interface CustomerAdminRecord {
  id: string;
  name: string;
  phone: string;
  schemeName: string;
  status: 'Active' | 'Overdue' | 'Matured';
  outstandingAmount: number;
  joinedDate: string;
}

export interface AuditLog {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  target: string;
  timestamp: string;
}
