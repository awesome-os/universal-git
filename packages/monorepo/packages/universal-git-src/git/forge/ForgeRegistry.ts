/**
 * Registry for Git Forge adapters
 * 
 * This registry allows registering and retrieving forge adapters by name or URL.
 * It supports auto-detection of forges from URLs and custom adapter registration.
 */

import type { GitForgeAdapter } from './GitForgeAdapter.ts'
import type { HttpClient } from '../remote/GitRemoteHTTP.ts'
import type { ForgeAuth } from './types.ts'

/**
 * Registry for Git Forge adapters
 */
export class ForgeRegistry {
  private static adapters = new Map<string, new (http: HttpClient, auth?: ForgeAuth) => GitForgeAdapter>()

  /**
   * Register a forge adapter
   * 
   * @param name - The name of the forge (e.g., 'github', 'gitlab')
   * @param adapterClass - The adapter class constructor
   */
  static register(
    name: string,
    adapterClass: new (http: HttpClient, auth?: ForgeAuth) => GitForgeAdapter
  ): void {
    this.adapters.set(name.toLowerCase(), adapterClass)
  }

  /**
   * Get a forge adapter by name
   * 
   * @param name - The name of the forge
   * @param http - The HTTP client to use
   * @param auth - Optional authentication information
   * @returns The forge adapter instance
   * @throws Error if the forge is not registered
   */
  static getAdapter(
    name: string,
    http: HttpClient,
    auth?: ForgeAuth
  ): GitForgeAdapter {
    const AdapterClass = this.adapters.get(name.toLowerCase())
    if (!AdapterClass) {
      throw new Error(
        `Forge adapter '${name}' is not registered. Available forges: ${Array.from(this.adapters.keys()).join(', ')}`
      )
    }
    return new AdapterClass(http, auth)
  }

  /**
   * Detect and get a forge adapter from a URL
   * 
   * @param url - The repository URL
   * @param http - The HTTP client to use
   * @param auth - Optional authentication information
   * @returns The forge adapter instance, or null if no adapter can handle the URL
   */
  static detectAndGetAdapter(
    url: string,
    http: HttpClient,
    auth?: ForgeAuth
  ): GitForgeAdapter | null {
    for (const AdapterClass of this.adapters.values()) {
      // Create a temporary instance to test detection
      const tempAdapter = new AdapterClass(http, auth)
      if (tempAdapter.detect(url)) {
        return tempAdapter
      }
    }
    return null
  }

  /**
   * Get all registered forge names
   * 
   * @returns Array of registered forge names
   */
  static getRegisteredForges(): string[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * Check if a forge is registered
   * 
   * @param name - The name of the forge
   * @returns true if the forge is registered, false otherwise
   */
  static isRegistered(name: string): boolean {
    return this.adapters.has(name.toLowerCase())
  }
}

