import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * SSH connection interface for Git SSH protocol
 */
export interface SshConnection {
  /**
   * Execute a command on the remote server
   */
  execute(command: string): Promise<{
    stdout: AsyncIterableIterator<Uint8Array>
    stderr: AsyncIterableIterator<Uint8Array>
    stdin?: (data: Uint8Array | UniversalBuffer) => Promise<void>
    exitCode: Promise<number>
  }>

  /**
   * Close the SSH connection
   */
  close(): Promise<void>
}

/**
 * Progress event emitted during SSH operations
 */
export type GitSshProgressEvent = {
  phase: string
  loaded: number
  total: number
}

/**
 * Callback for progress updates during SSH operations
 */
export type SshProgressCallback = (progress: GitSshProgressEvent) => void | Promise<void>

/**
 * SSH connection options
 */
export type SshConnectOptions = {
  host: string
  port?: number
  username?: string
  privateKey?: string | UniversalBuffer
  password?: string
  passphrase?: string
  onProgress?: SshProgressCallback
  timeout?: number
}

/**
 * SSH client interface for Git SSH protocol
 */
export interface SshClient {
  /**
   * Connect to an SSH server
   */
  connect(options: SshConnectOptions): Promise<SshConnection>
}

