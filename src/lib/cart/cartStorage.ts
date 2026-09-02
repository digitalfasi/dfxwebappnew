import { CartItem, AppliedCoupon } from '@/types/cart';

const STORAGE_KEY = 'jros_cart_v1';

export interface StoredCartData {
  items: CartItem[];
  coupon: AppliedCoupon | null;
}

export function loadCartFromStorage(): StoredCartData {
  if (typeof window === 'undefined') {
    return { items: [], coupon: null };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { items: [], coupon: null };
    }
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      coupon: parsed.coupon || null,
    };
  } catch (error) {
    console.error('Failed to load cart from localStorage:', error);
    return { items: [], coupon: null };
  }
}

export function saveCartToStorage(items: CartItem[], coupon: AppliedCoupon | null): void {
  if (typeof window === 'undefined') return;

  try {
    const data: StoredCartData = { items, coupon };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save cart to localStorage:', error);
  }
}

export function clearCartStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear cart storage:', error);
  }
}
