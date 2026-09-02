"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Product } from '@/types';
import { CartItem, AppliedCoupon, CartSummary } from '@/types/cart';
import { CartService } from '@/services/cartService';
import { loadCartFromStorage, saveCartToStorage, clearCartStorage } from '@/lib/cart/cartStorage';
import { Toast } from '@/components/ui/toast';

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

interface CartContextType {
  items: CartItem[];
  appliedCoupon: AppliedCoupon | null;
  summary: CartSummary;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Rehydrate state from LocalStorage on mount
  useEffect(() => {
    const stored = loadCartFromStorage();
    setItems(stored.items);
    setAppliedCoupon(stored.coupon);
    setIsHydrated(true);
  }, []);

  // Sync with LocalStorage whenever items or coupon change
  useEffect(() => {
    if (!isHydrated) return;

    // Revalidate coupon against current subtotal
    const subtotal = CartService.getSummary(items, null).subtotal;
    const revalidatedCoupon = CartService.revalidateCoupon(appliedCoupon, subtotal);

    if (appliedCoupon && !revalidatedCoupon) {
      setAppliedCoupon(null);
      showToast('Applied coupon removed because minimum order requirement is no longer met.', 'error');
    } else if (revalidatedCoupon !== appliedCoupon) {
      setAppliedCoupon(revalidatedCoupon);
    }

    saveCartToStorage(items, revalidatedCoupon);
  }, [items, appliedCoupon, isHydrated, showToast]);

  const summary = useMemo(() => {
    return CartService.getSummary(items, appliedCoupon);
  }, [items, appliedCoupon]);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((prev) => !prev), []);

  const addToCart = useCallback(
    (product: Product, quantityToAdd = 1) => {
      const result = CartService.addItem(items, product, quantityToAdd);
      setItems(result.items);

      if (result.success) {
        showToast(result.message, 'success');
      } else {
        showToast(result.message, 'error');
      }
    },
    [items, showToast]
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      const result = CartService.updateQuantity(items, productId, quantity);
      setItems(result.items);

      if (result.maxStockReached) {
        showToast(result.message, 'error');
      } else if (result.success) {
        showToast('Quantity updated.', 'success');
      }
    },
    [items, showToast]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      const updated = CartService.removeItem(items, productId);
      setItems(updated);
      showToast('Item removed.', 'success');
    },
    [items, showToast]
  );

  const clearCart = useCallback(() => {
    const updated = CartService.clearAll();
    setItems(updated);
    setAppliedCoupon(null);
    clearCartStorage();
    showToast('Cart cleared.', 'success');
  }, [showToast]);

  const applyCoupon = useCallback(
    (code: string): boolean => {
      const subtotal = summary.subtotal;
      const result = CartService.applyCoupon(subtotal, code);

      if (result.success && result.coupon) {
        setAppliedCoupon(result.coupon);
        showToast('Coupon applied.', 'success');
        return true;
      } else {
        showToast(result.message, 'error');
        return false;
      }
    },
    [summary.subtotal, showToast]
  );

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    showToast('Coupon removed.', 'success');
  }, [showToast]);

  return (
    <CartContext.Provider
      value={{
        items,
        appliedCoupon,
        summary,
        isCartOpen,
        openCart,
        closeCart,
        toggleCart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        applyCoupon,
        removeCoupon,
        showToast,
      }}
    >
      {children}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </CartContext.Provider>
  );
};

export function useCartContext(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
}
