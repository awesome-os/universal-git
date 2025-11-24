// SmartProtocolManager wraps the wire protocol functions for fetch/push operations
// This is a simplified facade that can be expanded with full protocol handling

import { writeUploadPackRequest } from '../../wire/writeUploadPackRequest.ts'
import { parseUploadPackResponse } from '../../wire/parseUploadPackResponse.ts'
import { writeReceivePackRequest } from '../../wire/writeReceivePackRequest.ts'
import { parseReceivePackResponse } from '../../wire/parseReceivePackResponse.ts'
import { writeListRefsRequest } from '../../wire/writeListRefsRequest.ts'
import { parseListRefsResponse } from '../../wire/parseListRefsResponse.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

type UploadPackRequestParams = {
  capabilities?: string[]
  wants: string[]
  haves?: string[]
  shallows?: string[]
  depth?: number | null
  since?: Date | null
  exclude?: string[]
}

type ReceivePackRequestParams = {
  capabilities?: string[]
  triplets?: Array<{ oldoid: string; oid: string; fullRef: string }>
}

type ListRefsRequestParams = {
  prefix?: string
  symrefs?: boolean
  peelTags?: boolean
}

/**
 * Smart Protocol Manager for Git fetch/push operations
 * This wraps the wire protocol parsing/writing functions
 */
export class SmartProtocolManager {
  /**
   * Creates an upload-pack request for fetching
   */
  static createUploadPackRequest({
    capabilities = [],
    wants,
    haves = [],
    shallows = [],
    depth = null,
    since = null,
    exclude = [],
  }: UploadPackRequestParams): UniversalBuffer[] {
    return writeUploadPackRequest({ capabilities, wants, haves, shallows, depth, since, exclude })
  }

  /**
   * Parses an upload-pack response
   */
  static async parseUploadPackResponse(stream: AsyncIterableIterator<Uint8Array>, protocolVersion: 1 | 2 = 1): Promise<unknown> {
    return parseUploadPackResponse(stream, protocolVersion)
  }

  /**
   * Creates a receive-pack request for pushing
   */
  static async createReceivePackRequest({ capabilities = [], triplets = [] }: ReceivePackRequestParams): Promise<UniversalBuffer[]> {
    return writeReceivePackRequest({ capabilities, triplets })
  }

  /**
   * Parses a receive-pack response
   */
  static async parseReceivePackResponse(stream: AsyncIterableIterator<Uint8Array>): Promise<unknown> {
    return parseReceivePackResponse(stream)
  }

  /**
   * Lists refs from a remote
   */
  static async createListRefsRequest({ prefix, symrefs = false, peelTags = false }: ListRefsRequestParams): Promise<UniversalBuffer[]> {
    return writeListRefsRequest({ prefix, symrefs, peelTags })
  }

  /**
   * Parses a list-refs response
   */
  static async parseListRefsResponse(stream: AsyncIterableIterator<Uint8Array>): Promise<unknown> {
    return parseListRefsResponse(stream)
  }
}
