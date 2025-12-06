/**
 * Parse Git Ref Advertisement
 * Parses the ref advertisement from git-upload-pack info/refs endpoint
 */
import { GitPktLine } from './GitPktLine.ts';

export interface ServerRef {
  ref: string;
  oid: string;
  target?: string; // For symbolic refs
  peeled?: string; // For annotated tags
}

export interface RefAdvertisement {
  protocolVersion: 1 | 2;
  refs: Map<string, string>;
  symrefs: Map<string, string>;
  capabilities: Set<string>;
  capabilities2?: Record<string, string | true>; // For protocol v2
}

/**
 * Parses ref advertisement response
 */
export async function parseRefAdvertisement(
  stream: AsyncIterableIterator<Uint8Array>,
  service: 'git-upload-pack' | 'git-receive-pack' = 'git-upload-pack'
): Promise<RefAdvertisement> {
  const read = GitPktLine.streamReader(stream);
  const refs = new Map<string, string>();
  const symrefs = new Map<string, string>();
  let capabilities = new Set<string>();
  let capabilities2: Record<string, string | true> | undefined;
  let protocolVersion: 1 | 2 = 1;

  // Read first line (service announcement)
  let firstLine = await read();
  // Skip flush packets
  while (firstLine === null) {
    firstLine = await read();
  }
  
  if (firstLine === true) {
    throw new Error('Invalid ref advertisement: empty response');
  }

  const firstLineStr = new TextDecoder().decode(firstLine).trim();
  
  // Check for protocol v2
  if (firstLineStr.includes('version 2')) {
    protocolVersion = 2;
    // Protocol v2 format
    let line: Uint8Array | null | true;
    while (true) {
      line = await read();
      if (line === true || line === null) break;
      
      const lineStr = new TextDecoder().decode(line).trim();
      if (lineStr === '') break;
      
      // Parse capability
      if (lineStr.includes('=')) {
        const [key, value] = lineStr.split('=', 2);
        capabilities2 = capabilities2 || {};
        capabilities2[key] = value || true;
      } else {
        capabilities2 = capabilities2 || {};
        capabilities2[lineStr] = true;
      }
    }
    
    // Read refs
    while (true) {
      line = await read();
      if (line === true || line === null) break;
      
      const lineStr = new TextDecoder().decode(line).trim();
      if (lineStr === '') continue;
      
      const parts = lineStr.split(' ');
      const [oid, ref, ...attrs] = parts;
      
      if (oid && ref) {
        refs.set(ref, oid);
        
        // Parse attributes
        for (const attr of attrs) {
          if (attr.startsWith('symref-target:')) {
            symrefs.set(ref, attr.slice('symref-target:'.length));
          }
        }
      }
    }
  } else {
    // Protocol v1 format
    // First line contains service announcement
    if (!firstLineStr.includes(`# service=${service}`)) {
      throw new Error(`Invalid ref advertisement: expected "# service=${service}", got "${firstLineStr}"`);
    }

    // Read flush packet
    let flush = await read();
    while (flush === null) {
      flush = await read();
    }

    // Handle empty repository
    if (flush === true) {
      return {
        protocolVersion: 1,
        refs,
        symrefs,
        capabilities,
      };
    }

    // Second line contains first ref and capabilities
    const secondLineStr = new TextDecoder().decode(flush).trim();
    
    // Check for protocol v2 in second line
    if (secondLineStr.includes('version 2')) {
      protocolVersion = 2;
      // Would need to parse v2 format here
      // For now, fall through to v1 parsing
    }

    // Parse first ref line (contains capabilities)
    const [firstRef, capabilitiesLine] = secondLineStr.split('\0');
    
    if (capabilitiesLine) {
      capabilitiesLine.split(' ').forEach((cap) => {
        if (cap) capabilities.add(cap);
      });
    }

    // Parse first ref
    if (firstRef && firstRef !== '0000000000000000000000000000000000000000 capabilities^{}') {
      const [oid, refName] = firstRef.split(' ');
      if (oid && refName) {
        refs.set(refName, oid);
      }
    }

    // Read remaining refs
    while (true) {
      const line = await read();
      if (line === true) break;
      if (line === null) continue;

      const lineStr = new TextDecoder().decode(line).trim();
      if (!lineStr) continue;

      const parts = lineStr.split(' ');
      const [oid, refName] = parts;

      if (oid && refName) {
        refs.set(refName, oid);
      }
    }

    // Extract symrefs from capabilities
    for (const cap of capabilities) {
      if (cap.startsWith('symref=')) {
        const match = cap.match(/symref=([^:]+):(.*)/);
        if (match && match.length === 3) {
          symrefs.set(match[1], match[2]);
        }
      }
    }
  }

  return {
    protocolVersion,
    refs,
    symrefs,
    capabilities,
    capabilities2,
  };
}
