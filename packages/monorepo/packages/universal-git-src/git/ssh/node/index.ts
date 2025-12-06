import { spawn, ChildProcess } from 'child_process'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { SshClient, SshConnection, SshConnectOptions } from '../SshClient.ts'

/**
 * Node.js SSH connection implementation using child_process
 * 
 * Note: This implementation spawns a new SSH process for each command execution.
 * For proper Git over SSH with bidirectional communication, the ssh2 package is recommended.
 */
class NodeSshConnection implements SshConnection {
  private hostString: string
  private args: string[]
  private timeout: number
  private closed = false
  private currentProcess: ChildProcess | null = null

  constructor(hostString: string, args: string[], timeout: number) {
    this.hostString = hostString
    this.args = args
    this.timeout = timeout
  }

  async execute(command: string): Promise<{
    stdout: AsyncIterableIterator<Uint8Array>
    stderr: AsyncIterableIterator<Uint8Array>
    stdin?: (data: Uint8Array | UniversalBuffer) => Promise<void>
    exitCode: Promise<number>
  }> {
    if (this.closed) {
      throw new Error('Connection is closed')
    }

    // Spawn a new SSH process for this command
    // Format: ssh [args] user@host command
    const process = spawn('ssh', [...this.args, this.hostString, command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.currentProcess = process

    // Set timeout
    let timeoutId: NodeJS.Timeout | null = null
    if (this.timeout > 0) {
      timeoutId = setTimeout(() => {
        if (!process.killed) {
          process.kill()
        }
      }, this.timeout)
    }

    const exitCode = new Promise<number>((resolve) => {
      process.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve(code || 0)
      })
    })

    // Stdin support for child_process
    const stdin = async (data: Uint8Array | UniversalBuffer): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!process.stdin) {
          reject(new Error('Stdin not available'))
          return
        }
        if (process.killed) {
          reject(new Error('Process has been killed'))
          return
        }
        process.stdin!.write(UniversalBuffer.from(data), (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    // Handle process errors
    process.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId)
    })

    return {
      stdout: UniversalBuffer.fromNodeStream(process.stdout!),
      stderr: UniversalBuffer.fromNodeStream(process.stderr!),
      stdin,
      exitCode,
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill()
    }
  }
}

/**
 * Node.js SSH client implementation using child_process with ssh command
 * 
 * Note: This implementation uses the system's `ssh` command.
 * For more advanced features (like key-based auth), consider using the `ssh2` npm package.
 */
class NodeSshClient implements SshClient {
  async connect(options: SshConnectOptions): Promise<SshConnection> {
    const { host, port = 22, username, privateKey, password, passphrase, timeout = 30000 } = options

    // Build SSH command arguments
    const args: string[] = []
    
    // Add port if specified
    if (port !== 22) {
      args.push('-p', port.toString())
    }

    // Add private key if specified
    if (privateKey) {
      // For now, we'll use -i flag (requires key file path)
      // TODO: Support in-memory keys by writing to temp file
      if (typeof privateKey === 'string' && !privateKey.includes('\n')) {
        // Assume it's a file path
        args.push('-i', privateKey)
      } else {
        throw new Error('In-memory private keys not yet supported. Please provide a file path.')
      }
    }

    // Add password authentication (via sshpass if available)
    // Note: This is a limitation - proper implementation should use ssh2 package
    if (password) {
      console.warn('Password authentication via child_process is not secure. Consider using ssh2 package.')
    }

    // Build host string
    const hostString = username ? `${username}@${host}` : host

    // For child_process approach, we create a connection that will spawn new processes for each command
    // This is a simplified approach - for proper Git over SSH, ssh2 package is recommended
    // The connection object will spawn a new process for each execute() call
    return Promise.resolve(new NodeSshConnection(hostString, args, timeout))
  }
}

/**
 * Alternative implementation using ssh2 package (if available)
 * 
 * This provides better support for:
 * - In-memory private keys
 * - Password authentication
 * - Better error handling
 * 
 * To use this, install: npm install ssh2
 */
async function createSsh2Client(): Promise<SshClient | null> {
  try {
    const { importSsh2 } = await import('../../type-wrappers/ssh2.ts')
    const ssh2 = await importSsh2()
    const Client = ssh2.Client || ssh2.default.Client
    
    class Ssh2Client implements SshClient {
      async connect(options: SshConnectOptions): Promise<SshConnection> {
        const { host, port = 22, username, privateKey, password, passphrase, timeout = 30000 } = options

        return new Promise((resolve, reject) => {
          const conn = new Client()
          let connected = false
          let timeoutId: NodeJS.Timeout | null = null

          if (timeout > 0) {
            timeoutId = setTimeout(() => {
              if (!connected) {
                conn.end()
                reject(new Error(`SSH connection timeout after ${timeout}ms`))
              }
            }, timeout)
          }

          conn.on('ready', () => {
            connected = true
            if (timeoutId) clearTimeout(timeoutId)
            resolve(new Ssh2Connection(conn))
          })

          conn.on('error', (err) => {
            if (timeoutId) clearTimeout(timeoutId)
            reject(err)
          })

          const connectOptions: any = {
            host,
            port,
            username: username || 'git',
            readyTimeout: timeout,
          }

          if (privateKey) {
            connectOptions.privateKey = typeof privateKey === 'string' ? privateKey : privateKey.toString()
            if (passphrase) {
              connectOptions.passphrase = passphrase
            }
          }

          if (password) {
            connectOptions.password = password
          }

          conn.connect(connectOptions)
        })
      }
    }

    class Ssh2Connection implements SshConnection {
      private conn: any
      private closed = false

      constructor(conn: any) {
        this.conn = conn
      }

      async execute(command: string): Promise<{
        stdout: AsyncIterableIterator<Uint8Array>
        stderr: AsyncIterableIterator<Uint8Array>
        stdin?: (data: Uint8Array | UniversalBuffer) => Promise<void>
        exitCode: Promise<number>
      }> {
        if (this.closed) {
          throw new Error('Connection is closed')
        }

        return new Promise((resolve, reject) => {
          this.conn.exec(command, (err: Error | null, stream: any) => {
            if (err) {
              reject(err)
              return
            }

            const exitCode = new Promise<number>((resolveExit) => {
              stream.on('close', (code: number) => {
                resolveExit(code || 0)
              })
            })

            // Stdin support for ssh2 (proper bidirectional communication)
            const stdin = async (data: Uint8Array | UniversalBuffer): Promise<void> => {
              return new Promise((resolveWrite, rejectWrite) => {
                stream.write(UniversalBuffer.from(data), (err: Error | undefined) => {
                  if (err) rejectWrite(err)
                  else resolveWrite()
                })
              })
            }

            resolve({
              stdout: UniversalBuffer.fromNodeStream(stream),
              stderr: UniversalBuffer.fromNodeStream(stream.stderr),
              stdin,
              exitCode,
            })
          })
        })
      }

      async close(): Promise<void> {
        if (this.closed) {
          return
        }
        this.closed = true
        this.conn.end()
      }
    }

    return new Ssh2Client()
  } catch {
    // ssh2 package not available, return null to use fallback
    return null
  }
}

/**
 * Default SSH client instance for Node.js
 * Tries to use ssh2 package if available, otherwise falls back to child_process
 * 
 * Note: This is a Promise that resolves to the client, so use: await sshClient
 */
export const sshClient: Promise<SshClient> = (async () => {
  const ssh2Client = await createSsh2Client()
  return ssh2Client || new NodeSshClient()
})()

export default { sshClient }

