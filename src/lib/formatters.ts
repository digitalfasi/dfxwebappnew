export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatWeight(grams: number): string {
  return `${grams.toFixed(3)} g`;
}

export function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Net gold weight calculation rule:
 * Net Amount = Total Payment / 1.03 (excluding 3% GST tax)
 * Gold Weight = Net Amount / Live 24K Rate
 */
export function calculateGoldWeight(totalPayable: number, goldRate24k: number): {
  netAmount: number;
  gstAmount: number;
  weightGrams: number;
} {
  const gstAmount = Math.round(totalPayable - totalPayable / 1.03);
  const netAmount = totalPayable - gstAmount;
  const weightGrams = parseFloat((netAmount / goldRate24k).toFixed(3));
  return { netAmount, gstAmount, weightGrams };
}
