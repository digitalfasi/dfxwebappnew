import { CartItem, AppliedCoupon, CartSummary } from '@/types/cart';
import { recalculateCouponDiscount } from './couponEngine';

export const DEFAULT_GST_RATE = 0.03; // 3% GST standard on Gold/Jewellery
export const DEFAULT_SHIPPING_FEE = 500; // Insured shipping
export const FREE_SHIPPING_THRESHOLD = 100000; // Free shipping above ₹100,000

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
}

export function calculateTotalWeightGrams(items: CartItem[]): number {
  return items.reduce((acc, item) => acc + item.product.weightGrams * item.quantity, 0);
}

export function calculateTotalItemsCount(items: CartItem[]): number {
  return items.reduce((acc, item) => acc + item.quantity, 0);
}

export function calculateDiscount(subtotal: number, coupon: AppliedCoupon | null): number {
  if (!coupon || subtotal <= 0) return 0;
  const recalculated = recalculateCouponDiscount(coupon, subtotal);
  return recalculated ? recalculated.discountAmount : 0;
}

export function calculateShipping(subtotal: number, coupon: AppliedCoupon | null): number {
  if (subtotal <= 0) return 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  if (coupon && coupon.code.toUpperCase() === 'FREESHIP') return 0;
  return DEFAULT_SHIPPING_FEE;
}

export function calculateGST(netAmount: number, gstRate: number = DEFAULT_GST_RATE): number {
  if (netAmount <= 0) return 0;
  return Math.round(netAmount * gstRate);
}

export function calculateGrandTotal(
  subtotal: number,
  discount: number,
  shipping: number,
  gst: number
): number {
  const total = subtotal - discount + shipping + gst;
  return Math.max(0, total);
}

export function calculateSummary(
  items: CartItem[],
  coupon: AppliedCoupon | null
): CartSummary {
  const subtotal = calculateSubtotal(items);
  const totalWeightGrams = calculateTotalWeightGrams(items);
  const totalItemsCount = calculateTotalItemsCount(items);
  
  const discountAmount = calculateDiscount(subtotal, coupon);
  const shippingFee = calculateShipping(subtotal, coupon);
  const netSubtotal = Math.max(0, subtotal - discountAmount);
  const gstAmount = calculateGST(netSubtotal);
  const grandTotal = calculateGrandTotal(subtotal, discountAmount, shippingFee, gstAmount);
  const isFreeShippingEligible = subtotal >= FREE_SHIPPING_THRESHOLD || (coupon?.code.toUpperCase() === 'FREESHIP');

  return {
    subtotal,
    discountAmount,
    shippingFee,
    gstAmount,
    grandTotal,
    totalWeightGrams,
    totalItemsCount,
    isFreeShippingEligible,
  };
}
