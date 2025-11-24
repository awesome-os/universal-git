/**
 * Worker infrastructure for universal-git
 * Provides worker thread support with Comlink and UniversalTransport
 */

// Proxies
export type {
  ProxiedRepository,
  ProxiedGitBackend,
  ProxiedGitWorktreeBackend,
  GitWorkerAPI,
  RepositoryOptions,
  GitBackendOptions,
  GitWorktreeBackendOptions,
} from './Proxies.ts'

// Worker infrastructure
export { ComlinkWorker } from './ComlinkWorker.ts'
export { WorkerPool } from './WorkerPool.ts'
export { GitWorkerImpl } from './GitWorkerImpl.ts'
export { MultiWorkerSparseCheckout } from './MultiWorkerSparseCheckout.ts'
export type { 
  MultiWorkerSparseCheckoutOptions,
  SubdirectoryTask,
} from './MultiWorkerSparseCheckout.ts'
export type {
  CheckoutSubdirectoriesOptions,
  CheckoutSubdirectoriesResult,
} from './Proxies.ts'

