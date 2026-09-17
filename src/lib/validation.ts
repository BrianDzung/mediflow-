export function normalizePhone(input: string): string {
  return input.replace(/[\s.\-()]/g, "");
}

export function isValidPhone(input: string): boolean {
  const phone = normalizePhone(input);
  return /^0\d{9}$/.test(phone) || /^\+84\d{9}$/.test(phone);
}

export function trimRequired(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
