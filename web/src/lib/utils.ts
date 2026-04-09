import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(v: number | null | undefined, d = 2): string {
  if (v == null || v === undefined || v === 0 && d === 0) return '-'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return String(v)
  return n.toFixed(d)
}
