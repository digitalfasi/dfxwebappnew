import { Product } from '@/types';
import {
  CartItem,
  AppliedCoupon,
  AddToCartResult,
  UpdateQuantityResult,
  CouponActionResult,
} from '@/types/cart';
import { validateAndApplyCoupon, recalculateCouponDiscount } from '@/lib/cart/couponEngine';
import { calculateSummary } from '@/lib/cart/cartCalculations';

export class CartService {
  /**
   * Adds a product to cart. If product exists, increases quantity.
   * Enforces max stock limit.
   */
  static addItem(
    currentItems: CartItem[],
    product: Product,
    quantityToAdd: number = 1
  ): AddToCartResult {
    const stockLimit = product.stock ?? 10;
    const existingIndex = currentItems.findIndex(
      (item) => item.product.id === product.id
    );

    if (existingIndex > -1) {
      const existingItem = currentItems[existingIndex];
      const newQuantity = existingItem.quantity + quantityToAdd;

      if (newQuantity > stockLimit) {
        // Cap at stock limit or warn if already at stock limit
        const cappedItems = [...currentItems];
        const maxAddable = Math.max(0, stockLimit - existingItem.quantity);

        if (maxAddable <= 0) {
          return {
            success: false,
            message: `Maximum available stock (${stockLimit} units) already reached for "${product.name}".`,
            items: currentItems,
            maxStockReached: true,
          };
        }

        cappedItems[existingIndex] = {
          ...existingItem,
          quantity: stockLimit,
        };

        return {
          success: true,
          message: `Added ${maxAddable} unit(s). Maximum stock limit (${stockLimit} units) reached.`,
          items: cappedItems,
          maxStockReached: true,
        };
      }

      const updatedItems = [...currentItems];
      updatedItems[existingIndex] = {
        ...existingItem,
        quantity: newQuantity,
      };

      return {
        success: true,
        message: `Updated "${product.name}" quantity to ${newQuantity}.`,
        items: updatedItems,
      };
    }

    // New item addition
    const initialQty = Math.min(quantityToAdd, stockLimit);
    const maxStockReached = initialQty >= stockLimit;
    const newItems = [...currentItems, { product, quantity: initialQty }];

    return {
      success: true,
      message: `"${product.name}" added to cart.`,
      items: newItems,
      maxStockReached,
    };
  }

  /**
   * Updates existing item quantity in cart.
   * Bound between 1 and product.stock.
   */
  static updateQuantity(
    currentItems: CartItem[],
    productId: string,
    requestedQuantity: number
  ): UpdateQuantityResult {
    const existingIndex = currentItems.findIndex(
      (item) => item.product.id === productId
    );

    if (existingIndex === -1) {
      return {
        success: false,
        message: 'Product not found in cart.',
        items: currentItems,
      };
    }

    const item = currentItems[existingIndex];
    const maxStock = item.product.stock ?? 10;
    const clampedQty = Math.max(1, Math.min(requestedQuantity, maxStock));
    const maxStockReached = requestedQuantity >= maxStock;

    const updatedItems = [...currentItems];
    updatedItems[existingIndex] = {
      ...item,
      quantity: clampedQty,
    };

    const msg = maxStockReached && requestedQuantity > maxStock
      ? `Maximum stock limit of ${maxStock} units reached for "${item.product.name}".`
      : 'Quantity updated.';

    return {
      success: true,
      message: msg,
      items: updatedItems,
      maxStockReached: maxStockReached && requestedQuantity > maxStock,
    };
  }

  /**
   * Removes item from cart by Product ID.
   */
  static removeItem(currentItems: CartItem[], productId: string): CartItem[] {
    return currentItems.filter((item) => item.product.id !== productId);
  }

  /**
   * Clears all items from cart.
   */
  static clearAll(): CartItem[] {
    return [];
  }

  /**
   * Validates and applies coupon code.
   */
  static applyCoupon(subtotal: number, code: string): CouponActionResult {
    return validateAndApplyCoupon(code, subtotal);
  }

  /**
   * Revalidates applied coupon against current subtotal.
   */
  static revalidateCoupon(
    coupon: AppliedCoupon | null,
    subtotal: number
  ): AppliedCoupon | null {
    return recalculateCouponDiscount(coupon, subtotal);
  }

  /**
   * Generates calculated summary for UI consumption.
   */
  static getSummary(items: CartItem[], coupon: AppliedCoupon | null) {
    return calculateSummary(items, coupon);
  }
}
