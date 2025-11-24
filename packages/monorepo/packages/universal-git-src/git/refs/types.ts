/**
 * Types for Git reference operations
 */

/**
 * Server-side ref information
 */
export type ServerRef = {
  ref: string // Name of the ref
  oid: string // SHA-1 object id the ref points to
  target?: string // Target ref pointed to by a symbolic ref
  peeled?: string // If oid is an annotated tag, this is the SHA-1 it points to
}

/**
 * Client-side ref information
 */
export type ClientRef = {
  ref: string // Name of the ref
  oid: string // SHA-1 object id the ref points to
}

/**
 * Ref update status
 */
export type RefUpdateStatus = {
  ok: boolean
  error?: string // Optional error message if ok is false
}

