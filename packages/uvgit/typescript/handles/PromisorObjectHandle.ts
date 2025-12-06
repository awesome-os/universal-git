/**
 * Promisor Object Handle
 * A wrapper around standard object handles that supports partial clones.
 * 
 * When an object is missing locally, it triggers a network fetch.
 * "I promise I can get this object" - hence "promisor"
 */
import type { GitObjectType, ParsedGitObject } from './GitLooseObjectHandle.ts';
import { GitLooseObjectHandle } from './GitLooseObjectHandle.ts';
import { GitPackedObjectHandle } from './GitPackedObjectHandle.ts';
import type { GitDirObjectsProvider } from '../providers/GitDirObjectsProvider.ts';

export interface RemoteFetcher {
  /**
   * Fetches objects from the remote repository.
   * @param oids - Array of object IDs to fetch
   * @returns Promise that resolves when objects are fetched and stored locally
   */
  fetchObjects(oids: string[]): Promise<void>;
}

export class PromisorObjectHandle {
  private oid: string;
  private localProvider: GitDirObjectsProvider;
  private remoteFetcher: RemoteFetcher;

  constructor(
    oid: string,
    localProvider: GitDirObjectsProvider,
    remoteFetcher: RemoteFetcher
  ) {
    this.oid = oid;
    this.localProvider = localProvider;
    this.remoteFetcher = remoteFetcher;
  }

  /**
   * Reads and parses the object.
   * If the object is missing locally, it triggers a network fetch.
   */
  async readParsed(): Promise<ParsedGitObject> {
    // 1. Try Local (Fast)
    const localHandle = await this.localProvider.getHandle(
      [this.oid.substring(0, 2), this.oid.substring(2)],
      null as any // Context not needed for direct lookup
    );

    if (localHandle) {
      if (localHandle instanceof GitLooseObjectHandle) {
        return await localHandle.readParsed();
      }
      if (localHandle instanceof GitPackedObjectHandle) {
        return await localHandle.readParsed();
      }
    }

    // 2. Local Miss -> Trigger Network Fetch (Slow)
    // "I promise I can get this object"
    await this.remoteFetcher.fetchObjects([this.oid]);

    // 3. Retry Local (object should now be available)
    const retryHandle = await this.localProvider.getHandle(
      [this.oid.substring(0, 2), this.oid.substring(2)],
      null as any
    );

    if (!retryHandle) {
      throw new Error(
        `Failed to fetch object ${this.oid} from remote repository`
      );
    }

    if (retryHandle instanceof GitLooseObjectHandle) {
      return await retryHandle.readParsed();
    }
    if (retryHandle instanceof GitPackedObjectHandle) {
      return await retryHandle.readParsed();
    }

    throw new Error(`Unexpected handle type for object ${this.oid}`);
  }

  /**
   * Gets the OID of this object.
   */
  getOid(): string {
    return this.oid;
  }
}
