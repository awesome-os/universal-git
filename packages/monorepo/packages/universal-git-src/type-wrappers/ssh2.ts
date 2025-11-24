/**
 * Type wrapper for ssh2
 * Provides type definitions when the package is not installed or types are incompatible
 */

export type Ssh2Client = {
  connect(config: Ssh2ConnectConfig): void
  on(event: 'ready', listener: () => void): Ssh2Client
  on(event: 'error', listener: (error: Error) => void): Ssh2Client
  exec(command: string, callback: (error: Error | null, stream: Ssh2Stream) => void): void
  end(): void
  [key: string]: unknown
}

export type Ssh2ConnectConfig = {
  host: string
  port?: number
  username?: string
  privateKey?: string | Buffer
  password?: string
  passphrase?: string
  readyTimeout?: number
  [key: string]: unknown
}

export type Ssh2Stream = {
  on(event: 'data', listener: (chunk: Buffer) => void): Ssh2Stream
  on(event: 'close', listener: (code: number) => void): Ssh2Stream
  write(data: Buffer | string, encoding?: string, callback?: (error?: Error) => void): boolean
  stderr?: Ssh2Stream
  [key: string]: unknown
}

export type Ssh2Module = {
  Client: new () => Ssh2Client
  default: {
    Client: new () => Ssh2Client
  }
}

/**
 * Type-safe import wrapper for ssh2
 */
export async function importSsh2(): Promise<Ssh2Module> {
  try {
    // Use dynamic import with type assertion
    return await import('ssh2') as unknown as Ssh2Module
  } catch {
    // Return a stub type that will cause runtime errors if used
    throw new Error('ssh2 module not available')
  }
}

