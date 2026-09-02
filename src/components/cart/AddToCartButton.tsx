"use client";

import React, { useState } from 'react';
import { Product } from '@/types';
import { useCart } from '@/hooks/useCart';
import { ShoppingBag, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddToCartButtonProps {
  product: Product;
  quantity?: number;
  variant?: 'primary' | 'secondary' | 'outline' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const AddToCartButton: React.FC<AddToCartButtonProps> = ({
  product,
  quantity = 1,
  variant = 'primary',
  size = 'md',
  showText = true,
  className,
}) => {
  const { addToCart, items } = useCart();
  const [isAdded, setIsAdded] = useState(false);

  const cartItem = items.find((i) => i.product.id === product.id);
  const currentCartQty = cartItem?.quantity || 0;
  const maxStock = product.stock ?? 10;
  const isOutofStock = maxStock <= 0;
  const isMaxStock = currentCartQty >= maxStock;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutofStock) return;

    addToCart(product, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1200);
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        disabled={isOutofStock}
        title={isOutofStock ? 'Out of Stock' : isMaxStock ? 'Max Stock Reached' : 'Add to Cart'}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-sm",
          isAdded
            ? "bg-emerald-600 text-white"
            : isOutofStock
            ? "bg-slate-line/50 text-slate-muted cursor-not-allowed"
            : "bg-ink text-white hover:bg-ink-2 hover:scale-105 active:scale-95",
          className
        )}
      >
        {isAdded ? (
          <Check className="h-4 w-4 animate-in zoom-in-50 duration-150" />
        ) : (
          <ShoppingBag className="h-4 w-4" />
        )}
      </button>
    );
  }

  const baseStyles = "relative font-display font-bold flex items-center justify-center gap-2 rounded-xl transition-all duration-200 shadow-md active:scale-[0.98]";
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-xs",
    lg: "px-6 py-3 text-sm",
  };

  const variantStyles = {
    primary: "bg-radial from-gold-light via-gold to-gold-dark text-ink border border-gold/40 hover:brightness-105",
    secondary: "bg-ink text-white hover:bg-ink-2",
    outline: "bg-white text-ink border border-slate-line hover:border-gold",
    icon: "",
  };

  return (
    <button
      onClick={handleClick}
      disabled={isOutofStock}
      className={cn(
        baseStyles,
        sizeStyles[size],
        variantStyles[variant],
        (isOutofStock || isMaxStock) && "opacity-80",
        className
      )}
    >
      {isAdded ? (
        <>
          <Check className="h-4 w-4 text-emerald-700 font-extrabold" />
          <span>Added!</span>
        </>
      ) : isOutofStock ? (
        <span>Out of Stock</span>
      ) : (
        <>
          <ShoppingBag className="h-4 w-4 shrink-0" />
          {showText && (
            <span>
              {isMaxStock ? `Max Stock (${maxStock})` : 'Add to Cart'}
            </span>
          )}
        </>
      )}
    </button>
  );
};
