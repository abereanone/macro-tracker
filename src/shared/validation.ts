import type { Visibility, WeightUnit } from './types';

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') throw new Error('Email is required.');
  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function positiveNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return number;
}

export function nonNegativeNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be greater than or equal to zero.`);
  return number;
}

export function optionalPositiveNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return positiveNumber(value, label);
}

export function requireDate(value: unknown, label = 'Date'): string {
  const date = requireString(value, label);
  if (!datePattern.test(date)) throw new Error(`${label} must be in YYYY-MM-DD format.`);
  return date;
}

export function requireVisibility(value: unknown): Visibility {
  if (value === 'public' || value === 'private') return value;
  throw new Error('Visibility must be public or private.');
}

export function requireWeightUnit(value: unknown): WeightUnit {
  if (value === 'lb' || value === 'kg') return value;
  throw new Error('Weight unit must be lb or kg.');
}
