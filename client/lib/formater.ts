export function formatDate(
  dateInput: string | Date,
  format: "day-month" | "full" | "short" = "short"
): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return String(dateInput);

  if (format === "day-month") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (format === "full") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return date.toLocaleDateString("en-US");
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
