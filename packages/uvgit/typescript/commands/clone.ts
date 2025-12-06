/**
 * Clone Command
 * Clones a repository from a remote URL over HTTP/HTTPS
 */
import type { FileSystemDirectoryHandle } from '@awesome-os/native-file-system-adapter-src';
import { GitDir } from '../GitDir.ts';
import { GitDirFsProvider } from '../providers/GitDirFsProvider.ts';
import { GitDirObjectsProvider } from '../providers/GitDirObjectsProvider.ts';
import { GitHttpTransport } from '../transport/GitHttpTransport.ts';
import { writeUploadPackRequest } from '../wire/writeUploadPackRequest.ts';
import { parseUploadPackResponse } from '../wire/parseUploadPackResponse.ts';
import { writeRef } from '../utils/refWriter.ts';
import { writeRefs } from '../utils/refWriter.ts';
import { writeFetchHead } from '../utils/refWriter.ts';
import { addRemote } from '../utils/configWriter.ts';
import type {
  HttpClient,
  ProgressCallback,
  AuthCallback,
  AuthSuccessCallback,
  AuthFailureCallback,
} from '../transport/types.ts';

export type CloneOptions = {
  gitDir: FileSystemDirectoryHandle;
  url: string;
  http: HttpClient;
  ref?: string;
  remote?: string;
  depth?: number;
  singleBranch?: boolean;
  noCheckout?: boolean;
  corsProxy?: string;
  headers?: Record<string, string>;
  onProgress?: ProgressCallback;
  onAuth?: AuthCallback;
  onAuthSuccess?: AuthSuccessCallback;
  onAuthFailure?: AuthFailureCallback;
  protocolVersion?: 1 | 2;
}

export type CloneResult = {
  defaultBranch: string | null;
  fetchHead: string | null;
  fetchHeadDescription: string | null;
}

/**
 * Clones a repository from a remote URL
 */
export async function clone(options: CloneOptions): Promise<CloneResult> {
  const {
    gitDir,
    url,
    http,
    ref,
    remote = 'origin',
    depth,
    singleBranch = false,
    noCheckout = false,
    corsProxy,
    headers = {},
    onProgress,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    protocolVersion = 2,
  } = options;

  // Initialize GitDir
  const gitDirInstance = new GitDir();
  const fsProvider = new GitDirFsProvider('', gitDir);
  gitDirInstance.mount(fsProvider);
  
  const objectsProvider = new GitDirObjectsProvider(gitDir);
  gitDirInstance.mount(objectsProvider);
  
  await gitDirInstance.init();

  // Discover remote repository
  if (onProgress) {
    onProgress({ phase: 'discover', loaded: 0, total: 0 });
  }

  const discovery = await GitHttpTransport.discover({
    service: 'git-upload-pack',
    url,
    protocolVersion,
    http,
    headers,
    corsProxy,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    onProgress,
  });

  // Determine which refs to fetch
  let wants: string[] = [];
  let defaultBranch: string | null = null;

  if (discovery.protocolVersion === 1) {
    const refs = discovery.refs;
    
    // Find default branch (HEAD)
    const headRef = refs.get('HEAD');
    if (headRef) {
      const symref = discovery.symrefs.get('HEAD');
      if (symref) {
        defaultBranch = symref;
        const defaultOid = refs.get(symref);
        if (defaultOid) {
          wants.push(defaultOid);
        }
      }
    }

    // Add requested ref or all branches
    if (ref) {
      const refOid = refs.get(ref);
      if (refOid) {
        wants.push(refOid);
      }
    } else if (!singleBranch && defaultBranch) {
      // Fetch all branches
      for (const [refName, oid] of refs.entries()) {
        if (refName.startsWith('refs/heads/')) {
          wants.push(oid);
        }
      }
    }
  } else {
    // Protocol v2 - would need to list refs first
    // For now, use protocol v1 fallback
    throw new Error('Protocol v2 clone not yet fully implemented');
  }

  // Remove duplicates
  wants = [...new Set(wants)];

  if (wants.length === 0) {
    throw new Error('No refs to fetch');
  }

  // Build upload pack request
  const capabilities = discovery.protocolVersion === 1
    ? Array.from(discovery.capabilities)
    : [];

  const requestBody = writeUploadPackRequest({
    capabilities,
    wants,
    haves: [], // No local objects yet for clone
    depth,
    protocolVersion: discovery.protocolVersion,
  });

  // Convert request body to async iterator
  const bodyIterator = (async function* () {
    for (const chunk of requestBody) {
      yield chunk;
    }
  })();

  // Connect and fetch
  if (onProgress) {
    onProgress({ phase: 'connect', loaded: 0, total: 0 });
  }

  const connection = await GitHttpTransport.connect({
    service: 'git-upload-pack',
    url,
    protocolVersion: discovery.protocolVersion,
    http,
    headers,
    auth: discovery.auth,
    corsProxy,
    body: bodyIterator,
    onProgress,
  });

  if (!connection.body) {
    throw new Error('No response body from server');
  }

  // Parse response
  if (onProgress) {
    onProgress({ phase: 'parse', loaded: 0, total: 0 });
  }

  const response = await parseUploadPackResponse(
    connection.body,
    discovery.protocolVersion
  );

  // Write packfile
  if (onProgress) {
    onProgress({ phase: 'packfile', loaded: 0, total: 0 });
  }

  const packfileName = `pack-${Date.now()}.pack`;
  const packResult = await objectsProvider.writePackfile(
    packfileName,
    response.packfile,
    onProgress
      ? (progress) => {
          // Map the progress event for writePackfile to match its expected type:
          const { phase, loaded, total } = progress;
          // If total is undefined, pass as undefined, else pass as number (writePackfile expects number | undefined)
          // But in our ProgressCallback, total is always either number or undefined, so this is okay.
          // But type signature requires that 'total' is number | undefined, but writePackfile expects number (not optional).
          // So we set to 0 if total is undefined.
          (onProgress as ProgressCallback)({
            phase,
            loaded,
            total: total !== undefined ? total : 0,
          });
        }
      : undefined
  );

  // Write refs
  if (onProgress) {
    onProgress({ phase: 'refs', loaded: 0, total: 0 });
  }

  if (discovery.protocolVersion === 1) {
    const refsToWrite = new Map<string, string>();
    
    // Write HEAD
    const headOid = discovery.refs.get('HEAD');
    if (headOid) {
      const symref = discovery.symrefs.get('HEAD');
      if (symref) {
        await writeRef(gitDirInstance, 'HEAD', symref);
      } else {
        await writeRef(gitDirInstance, 'HEAD', headOid);
      }
    }

    // Write branch refs
    for (const [refName, oid] of discovery.refs.entries()) {
      if (refName.startsWith('refs/heads/')) {
        refsToWrite.set(refName, oid);
      } else if (refName.startsWith('refs/tags/') && !singleBranch) {
        refsToWrite.set(refName, oid);
      }
    }

    await writeRefs(gitDirInstance, refsToWrite);

    // Write remote tracking refs
    const remoteRefs = new Map<string, string>();
    for (const [refName, oid] of discovery.refs.entries()) {
      if (refName.startsWith('refs/heads/')) {
        remoteRefs.set(`refs/remotes/${remote}/${refName.slice(11)}`, oid);
      }
    }
    await writeRefs(gitDirInstance, remoteRefs);
  }

  // Write FETCH_HEAD
  const fetchHeadOid = defaultBranch
    ? discovery.refs.get(defaultBranch) || null
    : null;
  
  if (fetchHeadOid) {
    await writeFetchHead(gitDirInstance, [
      {
        oid: fetchHeadOid,
        description: `${remote}/${defaultBranch || 'HEAD'}`,
        merge: true,
      },
    ]);
  }

  // Add remote configuration
  await addRemote(gitDirInstance, remote, url, `+refs/heads/*:refs/remotes/${remote}/*`);

  if (onProgress) {
    onProgress({ phase: 'done', loaded: 1, total: 1 });
  }

  return {
    defaultBranch,
    fetchHead: fetchHeadOid,
    fetchHeadDescription: fetchHeadOid
      ? `${remote}/${defaultBranch || 'HEAD'}`
      : null,
  };
}
