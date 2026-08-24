import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

export function getCurrentTimestamp(): number {
  return typeof window !== 'undefined' && window.performance
    ? Math.floor(window.performance.timeOrigin + window.performance.now())
    : 0;
}
