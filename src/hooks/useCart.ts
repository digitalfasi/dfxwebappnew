import { useCartContext } from '@/providers/CartProvider';

export function useCart() {
  return useCartContext();
}
