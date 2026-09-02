import { User, UserRole } from '@/types';
import { ApiError, STORAGE_KEYS, apiClient, refreshAccessToken, tokenStore } from '@/lib/apiClient';

export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
}

export interface SignupCustomerData {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  tenant_id: string;
}

/** Shape of the `user` object returned by the FastAPI backend. */
interface BackendUser {
  id: string;
  tenant_id: string | null;
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
  kyc_status: string;
  member_since: string | null;
  is_active: boolean;
}

interface TokenPayload {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/** Backend role names (app/core/constants.py) mapped to frontend workspace roles. */
const ROLE_MAP: Record<string, UserRole> = {
  Customer: 'customer',
  Staff: 'admin',
  Admin: 'admin',
  SuperAdmin: 'superadmin',
};

export const REDIRECT_BY_ROLE: Record<UserRole, string> = {
  customer: '/customer',
  admin: '/admin',
  superadmin: '/superadmin',
};

const KYC_STATUSES: User['kycStatus'][] = ['Verified', 'Pending', 'Rejected'];

function mapBackendUser(raw: BackendUser): User {
  const kycStatus = KYC_STATUSES.find((s) => s === raw.kyc_status) ?? 'Pending';
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone ?? '',
    email: raw.email ?? undefined,
    role: ROLE_MAP[raw.role] ?? 'customer',
    tenantId: raw.tenant_id ?? undefined,
    kycStatus,
    memberSince: raw.member_since ?? '',
  };
}

export function persistUser(user: User): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  localStorage.setItem(STORAGE_KEYS.role, user.role);
}

export const authService = {
  /** GET /api/v1/tenants/public — active stores for the signup dropdown. */
  async getPublicTenants(): Promise<PublicTenant[]> {
    const res = await apiClient.get<{ tenants: PublicTenant[] }>('/tenants/public');
    return res.data?.tenants ?? [];
  },

  /**
   * POST /api/v1/auth/signup
   * The backend does not issue tokens on registration — the user must sign in.
   */
  async signupCustomer(data: SignupCustomerData): Promise<User> {
    const res = await apiClient.post<{ user: BackendUser }>('/auth/signup', {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      password: data.password,
      tenant_id: data.tenant_id,
    });
    return mapBackendUser(res.data.user);
  },

  /**
   * POST /api/v1/auth/login followed by GET /api/v1/users/me.
   * `username` accepts either an email address or a registered mobile number.
   */
  async loginWithEmail(
    username: string,
    pass: string
  ): Promise<{ user: User; redirectPath: string }> {
    const res = await apiClient.post<TokenPayload>('/auth/login', {
      username: username.trim(),
      password: pass,
    });

    const tokens = res.data;
    if (!tokens?.access_token || !tokens?.refresh_token) {
      throw new ApiError('Login response did not contain a valid token pair.', 500);
    }
    tokenStore.setTokens(tokens.access_token, tokens.refresh_token);

    const user = await authService.fetchCurrentUser();
    return { user, redirectPath: REDIRECT_BY_ROLE[user.role] };
  },

  /** GET /api/v1/users/me — authoritative profile for the stored access token. */
  async fetchCurrentUser(): Promise<User> {
    const res = await apiClient.get<{ user: BackendUser }>('/users/me', { auth: true });
    const user = mapBackendUser(res.data.user);
    persistUser(user);
    return user;
  },

  /** POST /api/v1/auth/refresh — rotates the token pair. */
  async refreshSession(): Promise<boolean> {
    return (await refreshAccessToken()) !== null;
  },

  /** Cached profile, used for an instant first paint before /users/me resolves. */
  getCurrentUser(): User | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_KEYS.user);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as User;
    } catch {
      return null;
    }
  },

  hasSession(): boolean {
    return tokenStore.getAccessToken() !== null;
  },

  clearSession(): void {
    tokenStore.clear();
  },

  /** POST /api/v1/auth/logout — revokes the refresh token, then clears local state. */
  async logout(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();
    if (tokenStore.getAccessToken()) {
      try {
        await apiClient.post(
          '/auth/logout',
          { refresh_token: refreshToken, all_devices: false },
          { auth: true }
        );
      } catch (e) {
        // A failed revoke must never trap the user in a signed-in shell.
        console.error('Logout request failed:', e);
      }
    }
    tokenStore.clear();
  },

  /**
   * POST /api/v1/auth/forgot-password (Module 18)
   * Always resolves the same way whether or not the email matches a real
   * account — the backend deliberately gives no signal either way, so the
   * frontend must not infer anything from success/failure here beyond
   * "the request was submitted."
   */
  async forgotPassword(email: string): Promise<void> {
    await apiClient.post('/auth/forgot-password', { email });
  },

  /** POST /api/v1/auth/reset-password (Module 18) — token comes from the emailed link's `?token=` param. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { token, new_password: newPassword });
  },

  /** POST /api/v1/auth/email/verify/request (Module 18) — sends a verification email for the current user's own address. */
  async requestEmailVerification(): Promise<void> {
    await apiClient.post('/auth/email/verify/request', undefined, { auth: true });
  },

  /** POST /api/v1/auth/email/verify/confirm (Module 18) — token comes from the emailed link's `?token=` param. */
  async confirmEmailVerification(token: string): Promise<void> {
    await apiClient.post('/auth/email/verify/confirm', { token });
  },
};
