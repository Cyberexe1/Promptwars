export function currency(value: number, code: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}
export function date(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}
export function daysUntil(value: string) {
  return Math.max(
    0,
    Math.ceil(
      (new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86_400_000,
    ),
  );
}
