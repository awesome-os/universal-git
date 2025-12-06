/**
 * Registry for Git Backend implementations
 * 
 * This registry allows registering and retrieving backend factories by type.
 * It supports custom backend registration and auto-detection of backend types.
 */

import type { GitBackend } from './GitBackend.ts'
import type {
  BackendFactory,
  BackendOptions,
} from './types.ts'

/**
 * Registry for Git Backend implementations
 */
export class BackendRegistry {
  private static factories = new Map<string, BackendFactory>()

  /**
   * Register a backend factory
   * 
   * @param type - The backend type name (e.g., 'filesystem', 'sqlite', 'blob-storage')
   * @param factory - The factory function that creates backend instances
   */
  static register(type: string, factory: BackendFactory): void {
    this.factories.set(type.toLowerCase(), factory)
  }

  /**
   * Get a backend factory by type
   * 
   * @param type - The backend type name
   * @returns The factory function, or undefined if not registered
   */
  static getFactory(type: string): BackendFactory | undefined {
    return this.factories.get(type.toLowerCase())
  }

  /**
   * Check if a backend type is registered
   * 
   * @param type - The backend type name
   * @returns true if registered, false otherwise
   */
  static isRegistered(type: string): boolean {
    return this.factories.has(type.toLowerCase())
  }

  /**
   * Get all registered backend types
   * 
   * @returns Array of registered backend type names
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys())
  }

  /**
   * Create a backend instance from options
   * 
   * @param options - Backend creation options
   * @returns The backend instance
   * @throws Error if backend type is not registered
   */
  static createBackend(options: BackendOptions): GitBackend {
    const type = options.type.toLowerCase()
    const factory = this.factories.get(type)
    
    if (!factory) {
      const available = Array.from(this.factories.keys()).join(', ')
      throw new Error(
        `Backend type '${type}' is not registered. Available types: ${available || 'none'}`
      )
    }
    
    return factory(options)
  }

  /**
   * Detect backend type from a path or configuration
   * 
   * This is a simple heuristic - actual detection may need to check file contents
   * 
   * @param path - Path to check (gitdir or database path)
   * @returns Detected backend type, or 'filesystem' as default
   */
  static detectBackendType(path: string): string {
    // Check file extension
    if (path.endsWith('.db') || path.endsWith('.sqlite') || path.endsWith('.sqlite3')) {
      return 'sqlite'
    }
    
    // Check if it's a directory (likely filesystem)
    // Note: This is a heuristic - actual detection should check if directory exists
    // and contains .git structure or if file exists and is SQLite database
    
    // Default to filesystem
    return 'filesystem'
  }
}

