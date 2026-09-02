"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/hooks/useCart';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import {
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Tag,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const CartDrawer: React.FC = () => {
  const router = useRouter();
  const {
    items,
    appliedCoupon,
    summary,
    isCartOpen,
    closeCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [couponInput, setCouponInput] = useState('');

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    const success = applyCoupon(couponInput);
    if (success) {
      setCouponInput('');
    }
  };

  const handleCheckout = () => {
    closeCart();
    router.push('/customer/payment');
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="absolute inset-0 bg-ink/60 backdrop-blur-sm transition-opacity"
          />

          {/* Slide-over Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-screen max-w-md bg-cream shadow-2xl flex flex-col justify-between border-l border-slate-line"
            >
              {/* Header */}
              <div className="p-4 bg-white border-b border-slate-line flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gold/15 text-gold flex items-center justify-center">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-base text-ink">
                      Your Shopping Cart
                    </h2>
                    <p className="text-[11px] text-slate-muted">
                      {summary.totalItemsCount} item{summary.totalItemsCount !== 1 ? 's' : ''} ({formatWeight(summary.totalWeightGrams)})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-[11px] font-bold text-danger hover:underline px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={closeCart}
                    className="w-8 h-8 rounded-full bg-cream border border-slate-line flex items-center justify-center text-slate hover:bg-slate-line/40 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body / Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="w-20 h-20 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-4xl shadow-inner">
                      🛍️
                    </div>
                    <div className="space-y-1 max-w-[240px]">
                      <h3 className="font-display font-bold text-base text-ink">
                        Your Cart is Empty
                      </h3>
                      <p className="text-xs text-slate-muted">
                        Explore our certified 22K gold & diamond jewellery collection to start saving.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        closeCart();
                        router.push('/customer/catalogue');
                      }}
                      className="px-5 py-2.5 bg-ink text-white rounded-xl font-display font-bold text-xs shadow-md hover:bg-ink-2 transition-all"
                    >
                      Explore Catalogue
                    </button>
                  </div>
                ) : (
                  items.map(({ product, quantity }) => {
                    const maxStock = product.stock ?? 10;
                    const isMaxReached = quantity >= maxStock;

                    return (
                      <div
                        key={product.id}
                        className="bg-white p-3.5 rounded-2xl border border-slate-line shadow-card flex gap-3.5 relative group"
                      >
                        {/* Thumbnail */}
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-cream to-slate-line/40 flex items-center justify-center text-3xl shrink-0 border border-slate-line/50">
                          {product.icon}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex justify-between items-start">
                            <h4
                              onClick={() => {
                                closeCart();
                                router.push(`/customer/catalogue/${product.id}`);
                              }}
                              className="font-display font-bold text-xs text-ink truncate cursor-pointer hover:text-gold"
                            >
                              {product.name}
                            </h4>
                            <button
                              onClick={() => removeFromCart(product.id)}
                              className="text-slate-muted hover:text-danger p-1 transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-muted">
                            <span>{product.purity || '22K Gold'}</span>
                            <span>•</span>
                            <span>{formatWeight(product.weightGrams)}</span>
                          </div>

                          <div className="flex justify-between items-center pt-1">
                            <span className="font-display font-bold text-xs text-ink">
                              {formatCurrency(product.price * quantity)}
                            </span>

                            {/* Quantity Adjuster */}
                            <div className="flex items-center gap-1.5 bg-cream border border-slate-line rounded-lg p-0.5">
                              <button
                                onClick={() => updateQuantity(product.id, quantity - 1)}
                                className="w-6 h-6 rounded-md bg-white border border-slate-line/60 flex items-center justify-center text-slate hover:bg-slate-line/40 disabled:opacity-40"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-5 text-center font-mono font-bold text-xs text-ink">
                                {quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(product.id, quantity + 1)}
                                disabled={isMaxReached}
                                title={isMaxReached ? `Max stock limit (${maxStock}) reached` : 'Increase'}
                                className="w-6 h-6 rounded-md bg-white border border-slate-line/60 flex items-center justify-center text-slate hover:bg-slate-line/40 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {isMaxReached && (
                            <span className="text-[9px] font-semibold text-amber-700 block">
                              Max stock limit reached ({maxStock} available)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer / Summary & Checkout */}
              {items.length > 0 && (
                <div className="p-4 bg-white border-t border-slate-line space-y-3.5 shadow-2xl">
                  {/* Coupon Input & Active Badge */}
                  <div>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-emerald-600" />
                          <div>
                            <span className="font-mono font-bold text-emerald-800">
                              {appliedCoupon.code}
                            </span>
                            <p className="text-[10px] text-emerald-700">
                              {appliedCoupon.description}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={removeCoupon}
                          className="text-[11px] font-bold text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleApplyCoupon} className="flex gap-2">
                        <div className="relative flex-1">
                          <Tag className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-muted" />
                          <input
                            type="text"
                            value={couponInput}
                            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                            placeholder="Enter Coupon (e.g. GOLD5)"
                            className="w-full pl-8 pr-3 py-2 bg-cream border border-slate-line rounded-xl text-xs font-mono font-semibold text-ink uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:border-gold"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-3.5 py-2 bg-ink text-white rounded-xl text-xs font-bold hover:bg-ink-2 transition-colors"
                        >
                          Apply
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Summary Breakdown */}
                  <div className="space-y-1.5 text-xs border-t border-slate-line/60 pt-2.5">
                    <div className="flex justify-between text-slate-muted">
                      <span>Subtotal</span>
                      <span className="font-mono font-bold text-ink">
                        {formatCurrency(summary.subtotal)}
                      </span>
                    </div>

                    {summary.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span>Discount ({appliedCoupon?.code})</span>
                        <span className="font-mono font-bold">
                          - {formatCurrency(summary.discountAmount)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-muted">
                      <span className="flex items-center gap-1">
                        Shipping (Insured)
                        {summary.isFreeShippingEligible && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                            FREE
                          </span>
                        )}
                      </span>
                      <span className="font-mono font-bold text-ink">
                        {summary.shippingFee === 0 ? 'FREE' : formatCurrency(summary.shippingFee)}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-muted">
                      <span>GST (3%)</span>
                      <span className="font-mono font-bold text-ink">
                        {formatCurrency(summary.gstAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-line font-display font-extrabold text-base text-ink">
                      <span>Grand Total</span>
                      <span className="text-gold font-mono">
                        {formatCurrency(summary.grandTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-1">
                    <button
                      onClick={handleCheckout}
                      className="w-full py-3 rounded-xl bg-radial from-gold-light via-gold to-gold-dark text-ink font-display font-extrabold text-xs shadow-md hover:brightness-105 transition-all flex items-center justify-center gap-2"
                    >
                      <span>Proceed to Checkout</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>

                    <button
                      onClick={closeCart}
                      className="w-full py-2 rounded-xl bg-cream border border-slate-line text-slate text-xs font-bold hover:bg-slate-line/30 transition-colors"
                    >
                      Continue Shopping
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-muted pt-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>BIS 100% Hallmarked Gold & Certified Security</span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
