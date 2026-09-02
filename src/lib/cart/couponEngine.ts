import { CouponDef, AppliedCoupon, CouponActionResult } from '@/types/cart';

export const SUPPORTED_COUPONS: CouponDef[] = [
  {
    code: 'GOLD5',
    type: 'percentage',
    value: 5,
    description: '5% instant discount on total jewellery subtotal',
  },
  {
    code: 'FESTIVE10',
    type: 'percentage',
    value: 10,
    maxDiscount: 15000,
    description: '10% festive discount up to ₹15,000',
  },
  {
    code: 'FLAT1000',
    type: 'fixed',
    value: 1000,
    minSubtotal: 20000,
    description: 'Flat ₹1,000 off on orders above ₹20,000',
  },
  {
    code: 'FREESHIP',
    type: 'free_shipping',
    value: 100,
    description: 'Complimentary insured express delivery on your order',
  },
];

export function findCoupon(code: string): CouponDef | null {
  const normalized = code.trim().toUpperCase();
  return SUPPORTED_COUPONS.find((c) => c.code === normalized) || null;
}

export function validateAndApplyCoupon(
  code: string,
  subtotal: number
): CouponActionResult {
  if (!code || !code.trim()) {
    return {
      success: false,
      message: 'Please enter a coupon code',
      coupon: null,
    };
  }

  const couponDef = findCoupon(code);
  if (!couponDef) {
    return {
      success: false,
      message: 'Invalid coupon code. Try GOLD5, FESTIVE10, FLAT1000, or FREESHIP',
      coupon: null,
    };
  }

  if (couponDef.minSubtotal && subtotal < couponDef.minSubtotal) {
    return {
      success: false,
      message: `Coupon ${couponDef.code} requires a minimum subtotal of ₹${couponDef.minSubtotal.toLocaleString('en-IN')}`,
      coupon: null,
    };
  }

  let discountAmount = 0;
  if (couponDef.type === 'percentage') {
    discountAmount = Math.round((subtotal * couponDef.value) / 100);
    if (couponDef.maxDiscount && discountAmount > couponDef.maxDiscount) {
      discountAmount = couponDef.maxDiscount;
    }
  } else if (couponDef.type === 'fixed') {
    discountAmount = Math.min(couponDef.value, subtotal);
  } else if (couponDef.type === 'free_shipping') {
    discountAmount = 0; // handled during shipping calculation
  }

  const appliedCoupon: AppliedCoupon = {
    code: couponDef.code,
    type: couponDef.type,
    value: couponDef.value,
    discountAmount,
    description: couponDef.description,
  };

  return {
    success: true,
    message: `Coupon "${couponDef.code}" applied successfully!`,
    coupon: appliedCoupon,
  };
}

export function recalculateCouponDiscount(
  coupon: AppliedCoupon | null,
  subtotal: number
): AppliedCoupon | null {
  if (!coupon || subtotal <= 0) return null;

  const couponDef = findCoupon(coupon.code);
  if (!couponDef) return null;

  if (couponDef.minSubtotal && subtotal < couponDef.minSubtotal) {
    return null; // subtotal dropped below min requirement
  }

  let discountAmount = 0;
  if (couponDef.type === 'percentage') {
    discountAmount = Math.round((subtotal * couponDef.value) / 100);
    if (couponDef.maxDiscount && discountAmount > couponDef.maxDiscount) {
      discountAmount = couponDef.maxDiscount;
    }
  } else if (couponDef.type === 'fixed') {
    discountAmount = Math.min(couponDef.value, subtotal);
  }

  return {
    ...coupon,
    discountAmount,
  };
}
