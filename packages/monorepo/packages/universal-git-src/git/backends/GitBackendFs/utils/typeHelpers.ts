/**
 * Generic Type Inference Utilities
 * 
 * Provides type guards and assertion helpers that optimize TypeScript's type inference
 * by properly narrowing types and providing runtime safety.
 */

import { UniversalBuffer } from './UniversalBuffer.ts'

/**
 * Type guard for non-null values
 * Optimizes type inference by narrowing null/undefined
 */
export function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Type guard for non-undefined values
 * Optimizes type inference by narrowing undefined
 */
export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

/**
 * Type guard for string values
 * Optimizes type inference by narrowing to string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Type guard for UniversalBuffer values (includes Node.js Buffer for compatibility)
 * Optimizes type inference by narrowing to UniversalBuffer
 */
export function isBuffer(value: unknown): value is UniversalBuffer {
  return UniversalBuffer.isBuffer(value)
}

/**
 * Type guard for Uint8Array values
 * Optimizes type inference by narrowing to Uint8Array
 */
export function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

/**
 * Type guard for UniversalBuffer or Uint8Array
 * Optimizes type inference for binary data
 */
export function isBinaryData(value: unknown): value is UniversalBuffer | Uint8Array {
  return isBuffer(value) || isUint8Array(value)
}

/**
 * Generic helper to assert non-null with better error messages
 * Optimizes type inference and provides runtime safety
 */
export function assertNotNull<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value is null or undefined')
  }
}

/**
 * Generic helper to assert defined with better error messages
 * Optimizes type inference and provides runtime safety
 */
export function assertDefined<T>(
  value: T | undefined,
  message?: string
): asserts value is T {
  if (value === undefined) {
    throw new Error(message || 'Value is undefined')
  }
}

/**
 * Generic type-safe null coalescing with type inference
 * Returns defaultValue if value is null/undefined, otherwise returns value
 */
export function nullish<T>(value: T | null | undefined, defaultValue: T): T {
  return value ?? defaultValue
}

/**
 * Generic type-safe optional chaining with type inference
 * Returns undefined if any value in chain is null/undefined
 */
export function safeGet<T, K extends keyof T>(
  obj: T | null | undefined,
  key: K
): T[K] | undefined {
  return obj?.[key]
}

