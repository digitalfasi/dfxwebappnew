import { Product } from './index';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CouponDef {
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number; // e.g. 5 for 5%, 1000 for ₹1000 off
  minSubtotal?: number;
  maxDiscount?: number;
  description: string;
}

export interface AppliedCoupon {
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  discountAmount: number;
  description: string;
}

export interface CartSummary {
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  gstAmount: number;
  grandTotal: number;
  totalWeightGrams: number;
  totalItemsCount: number;
  isFreeShippingEligible: boolean;
}

export interface AddToCartResult {
  success: boolean;
  message: string;
  items: CartItem[];
  maxStockReached?: boolean;
}

export interface UpdateQuantityResult {
  success: boolean;
  message: string;
  items: CartItem[];
  maxStockReached?: boolean;
}

export interface CouponActionResult {
  success: boolean;
  message: string;
  coupon: AppliedCoupon | null;
}
