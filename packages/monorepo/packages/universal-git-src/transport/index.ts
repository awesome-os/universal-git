/**
 * UniversalTransport Layer
 * 
 * Provides swappable transport mechanisms for worker communication
 * Can be used in Orchestrator and above layers
 */

// Core interfaces
export type { Transport, TransportType, TransportOptions } from './Transport.ts'

// Factory
export { createTransport, createDefaultTransport } from './TransportFactory.ts'

// Transport implementations
export { BroadcastChannelTransport } from './transports/BroadcastChannelTransport.ts'
export { MessageChannelTransport } from './transports/MessageChannelTransport.ts'
export { LocalTransport } from './transports/LocalTransport.ts'

