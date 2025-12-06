/**
 * @file preflight.js
 * A functional, compositional implementation for discovering Git server capabilities.
 *
 * This module is designed with "clean code" principles in mind:
 * - Small, single-purpose functions.
 * - Curry-able "action" functions for creating specialized versions.
 * - A high-level API that reads like a declarative summary of its steps.
 */
import { PreflightError } from './modules/errors/errors.js'
// --- Core Utilities & Types ---
const GIT_PROTOCOL_V2_HEADER = { 'Git-Protocol': 'version=2' };

// --- Low-Level Parsers (The "How") ---
// These functions contain the detailed, imperative logic for parsing binary/text formats.

/**
 * Parses a single pkt-line and returns the data and the total line length.
 * The pkt-line format is a 4-byte hex length prefix followed by data.
 * @param {Buffer} buffer - The buffer to read from.
 * @param {number} offset - The starting offset.
 * @returns {{data: string, length: number, isFlush: boolean}}
 */
function parseSinglePktLine(buffer, offset) {
  if (offset + 4 > buffer.length) {
    return { data: null, length: 0, isFlush: true };
  }
  const lengthHex = buffer.subarray(offset, offset + 4).toString('ascii');
  const length = parseInt(lengthHex, 16);
  if (length === 0) {
    return { data: null, length: 4, isFlush: true }; // Flush packet '0000'
  }
  if (length < 4 || offset + length > buffer.length) {
    throw new Error('Invalid pkt-line length');
  }
  // The length includes the 4-byte header. The last byte is often a newline.
  const data = buffer.subarray(offset + 4, offset + length).toString('utf-8').trim();
  return { data, length, isFlush: false };
}

/**
 * Parses a Git Protocol v2 discovery response.
 * @param {Buffer} buffer - The raw response buffer.
 * @returns {object} The structured capabilities object.
 */
function parseV2Response(buffer) {
  const capabilities = new Map();
  const refs = { branches: {}, tags: {}, head: null };
  let offset = 0;

  // First lines are version and capabilities
  while (offset < buffer.length) {
    const { data, length, isFlush } = parseSinglePktLine(buffer, offset);
    offset += length;
    if (!data || data.includes('command=')) break; // End of capability section
    
    const [key, value] = data.split('=');
    capabilities.set(key, value || true);
  }
  
  // The rest are refs
  while (offset < buffer.length) {
    const { data, length } = parseSinglePktLine(buffer, offset);
    offset += length;
    if (!data) continue;

    const [sha, ref, ...attrs] = data.split(' ');
    if (ref.startsWith('refs/heads/')) {
        const branchName = ref.replace('refs/heads/', '');
        refs.branches[branchName] = sha;
    } else if (ref.startsWith('refs/tags/')) {
        const tagName = ref.replace('refs/tags/', '');
        // Tags can be annotated (point to a tag object) or lightweight (point to a commit)
        const peeled = attrs.find(a => a.startsWith('peeled:'));
        refs.tags[tagName] = {
            sha: sha,
            peeled: peeled ? peeled.replace('peeled:', '') : null,
        };
    }
    
    // Find what HEAD points to
    const symref = attrs.find(a => a.startsWith('symref-target:'));
    if (symref) {
        refs.head = {
            pointsTo: symref.replace('symref-target:', ''),
            sha: sha
        };
    }
  }

  return {
    protocolVersion: 2,
    objectFormat: capabilities.get('object-format') || 'sha1',
    capabilities: Object.fromEntries(capabilities),
    refs,
  };
}

/**
 * Parses a Git Protocol v1 discovery response.
 * @param {Buffer} buffer - The raw response buffer.
 * @returns {object} The structured capabilities object.
 */
function parseV1Response(buffer) {
  const capabilities = new Map();
  const refs = { branches: {}, tags: {}, head: null };
  let offset = 0;
  let firstLine = true;

  while (offset < buffer.length) {
    const { data, length, isFlush } = parseSinglePktLine(buffer, offset);
    offset += length;
    if (isFlush && firstLine) { continue; } // Some servers send an initial flush
    if (!data) { continue; }

    const [sha, ref, ...attrs] = data.split('\0'); // Capabilities are null-byte separated in the first line for v1
    
    if (firstLine) {
        // The first line in V1 contains the HEAD ref and capabilities
        firstLine = false;
        if (ref === 'HEAD') {
            refs.head = {
                pointsTo: null, // v1 doesn't explicitly say what HEAD points to, we find it later
                sha: sha,
            };
        }
        attrs[0]?.split(' ').forEach(cap => {
            const [key, value] = cap.split('=');
            capabilities.set(key, value || true);
        });
    }

    if (ref.startsWith('refs/heads/')) {
        const branchName = ref.replace('refs/heads/', '');
        refs.branches[branchName] = sha;
        // If this commit matches HEAD's commit, we found the symbolic ref target
        if (refs.head && refs.head.sha === sha) {
            refs.head.pointsTo = ref;
        }
    } else if (ref.startsWith('refs/tags/')) {
        const tagName = ref.replace('refs/tags/', '');
        refs.tags[tagName] = {
            sha: sha,
            peeled: data.includes('^{}') ? sha : null, // Simple heuristic for peeled tags in v1
        };
    }
  }

  return {
    protocolVersion: 1,
    objectFormat: capabilities.get('object-format') || 'sha1',
    capabilities: Object.fromEntries(capabilities),
    refs,
  };
}

// --- Mid-Level "Action" Functions (The "What") ---
// These are curry-able functions that create configured, reusable actions.

/**
 * Creates a function that builds a specific Git service URL from a base repo URL.
 * @param {string} service - The Git service name (e.g., 'git-upload-pack').
 * @returns {(repoUrlString: string) => URL} A new function that takes a repo URL string.
 */
const createServiceUrl = (service) => (repoUrlString) => {
  const repoUrl = new URL(repoUrlString.endsWith('.git') ? repoUrlString : `${repoUrlString}.git`);
  return new URL(`${repoUrl.pathname}/info/refs?service=${service}`, repoUrl.origin);
};

/**
 * Creates a function that fetches a URL with a predefined set of headers.
 * @param {object} headers - The headers to include in the request.
 * @returns {(url: URL) => Promise<Response>} A new function that takes a URL object.
 */
const fetchWithHeaders = (headers) => async (url) => {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.text()}`);
    }
    return response;
  } catch (err) {
    throw new PreflightError(`Failed to fetch from ${url}`, { cause: err });
  }
};

/**
 * A pure function to convert a fetch Response object into a Node.js Buffer.
 * @param {Response} response - The fetch Response.
 * @returns {Promise<Buffer>}
 */
const responseToBuffer = (response) => response.arrayBuffer().then(Buffer.from);

/**
 * A router function that inspects a buffer and delegates to the correct protocol parser.
 * This is the heart of the v2/v1 fallback logic.
 * @param {Buffer} buffer - The raw response buffer from the server.
 * @returns {object} The structured capabilities report.
 */
const parseDiscoveredRefs = (buffer) => {
  const isV2 = buffer.toString('utf8', 0, 12).includes('version 2');
  
  if (isV2) {
    return parseV2Refs(buffer);
  }
  
  console.log("Protocol v2 not detected. Falling back to v1 parsing.");
  return parseV1Refs(buffer);
};


// --- High-Level Composition (The "Story") ---
// We compose our smaller actions into a complete, readable workflow.

/**
 * Creates a URL for the 'git-upload-pack' service, used for cloning/fetching.
 */
const createUploadPackUrl = createServiceUrl('git-upload-pack');

/**
 * Creates a function that fetches a resource using the Git v2 protocol header.
 */
const fetchWithV2Headers = fetchWithHeaders(GIT_PROTOCOL_V2_HEADER);

/**
 * A composed action that fetches refs from a server, requesting v2,
 * and returns the raw response as a Buffer.
 * @param {URL} url - The service URL to fetch from.
 * @returns {Promise<Buffer>}
 */
const fetchRefs = async (url) => {
  const response = await fetchWithV2Headers(url);
  return responseToBuffer(response);
};

/**
 * Performs a preflight check against a Git repository to discover its
 * protocol version, capabilities, and refs. This function reads like a
 * summary of the steps involved.
 *
 * @param {string} repoUrlString - The HTTPS URL of the Git repository.
 * @returns {Promise<object>} A well-formatted JSON object with server capabilities.
 */
export async function gitPreflightCheck(repoUrlString) {
  // Step 1: Prepare the specific URL for ref discovery.
  const discoveryUrl = createUploadPackUrl(repoUrlString);

  // Step 2: Fetch the raw ref data from the server.
  const responseBuffer = await fetchRefs(discoveryUrl);

  // Step 3: Parse the data, automatically handling the protocol version.
  const preflightReport = parseDiscoveredRefs(responseBuffer);
  
  return preflightReport;
}

import { gitPreflightCheck } from './preflight.js';

async function main() {
  // Example 1: A modern GitHub repo (will use Protocol v2)
  const modernRepo = 'https://github.com/sveltejs/svelte.git';
  console.log(`--- Checking modern repo: ${modernRepo} ---`);
  try {
    const modernCapabilities = await gitPreflightCheck(modernRepo);
    console.log(JSON.stringify(modernCapabilities, null, 2));
  } catch (error) {
    console.error(error);
  }

  console.log('\n'.padEnd(80, '='));

  // Example 2: A legacy server known to use Protocol v1
  // This public server is often used for testing Git compatibility.
  const legacyRepo = 'https://git.samba.org/samba.git';
  console.log(`--- Checking legacy repo: ${legacyRepo} ---`);
  try {
    const legacyCapabilities = await gitPreflightCheck(legacyRepo);
    console.log(JSON.stringify(legacyCapabilities, null, 2));
  } catch (error) {
    console.error(error);
  }
}

main();
