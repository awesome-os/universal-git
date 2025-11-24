import type { Transport, TransportOptions } from './Transport.ts'
import { BroadcastChannelTransport } from './transports/BroadcastChannelTransport.ts'
import { MessageChannelTransport } from './transports/MessageChannelTransport.ts'
import { LocalTransport } from './transports/LocalTransport.ts'

/**
 * Factory function to create transports
 * This is the main entry point for creating transports
 */
export function createTransport(options: TransportOptions): Transport {
  switch (options.type) {
    case 'broadcast-channel':
      return new BroadcastChannelTransport(options.name || 'universal-git')
    case 'message-channel':
      if (!options.channel) {
        throw new Error('MessageChannel required for message-channel transport')
      }
      return new MessageChannelTransport(options.channel)
    case 'local':
      return new LocalTransport(options.name || 'default')
    default:
      throw new Error(`Unknown transport type: ${options.type}`)
  }
}

/**
 * Default transport factory - creates local transport (simplest, no dependencies)
 */
export function createDefaultTransport(name?: string): Transport {
  return createTransport({ type: 'local', name: name || 'universal-git' })
}

