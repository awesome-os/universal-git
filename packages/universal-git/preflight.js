/**
 * @file preflight.js
 * A functional, compositional implementation for discovering Git server capabilities.
 *
 * This module is designed with "clean code" principles in mind:
 * - Small, single-purpose functions.
 * - Curry-able "action" functions for creating specialized versions.
 * - A high-level API that reads like a declarative summary of its steps.
 */

// --- Core Utilities & Types ---

class PreflightError extends Error { /* ... (implementation from previous answer) ... */ }
const GIT_PROTOCOL_V2_HEADER = { 'Git-Protocol': 'version=2' };

// --- Low-Level Parsers (The "How") ---
// These functions contain the detailed, imperative logic for parsing binary/text formats.

/**
 * Parses a single pkt-line from a buffer at a given offset.
 * @private
 */
function parseSinglePktLine(buffer, offset) { /* ... (implementation from previous answer) ... */ }

/**
 * Parses a Git Protocol v2 discovery response buffer.
 * @private
 */
function parseV2Refs(buffer) { /* ... (implementation from previous answer) ... */ }

/**
 * Parses a Git Protocol v1 discovery response buffer.
 * @private
 */
function parseV1Refs(buffer) { /* ... (implementation from previous answer) ... */ }

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


// --- Pasted Implementations for Self-Containment ---
// To make this file runnable, the low-level parser implementations are included below.
class PreflightError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PreflightError';
  }
}
function parseSinglePktLine(buffer, offset) {
  if (offset + 4 > buffer.length) return { data: null, length: 0, isFlush: true };
  const lengthHex = buffer.subarray(offset, offset + 4).toString('ascii');
  const length = parseInt(lengthHex, 16);
  if (length === 0) return { data: null, length: 4, isFlush: true };
  if (length < 4 || offset + length > buffer.length) throw new Error('Invalid pkt-line length');
  const data = buffer.subarray(offset + 4, offset + length).toString('utf-8').trim();
  return { data, length, isFlush: false };
}
function parseV2Refs(buffer) {
  const capabilities = new Map();
  const refs = { branches: {}, tags: {}, head: null };
  let offset = 0;
  while (offset < buffer.length) {
    const { data, length } = parseSinglePktLine(buffer, offset);
    offset += length;
    if (!data || data.includes('command=')) break;
    const [key, value] = data.split('=');
    capabilities.set(key, value || true);
  }
  while (offset < buffer.length) {
    const { data, length } = parseSinglePktLine(buffer, offset);
    offset += length;
    if (!data) continue;
    const [sha, ref, ...attrs] = data.split(' ');
    if (ref.startsWith('refs/heads/')) refs.branches[ref.replace('refs/heads/', '')] = sha;
    else if (ref.startsWith('refs/tags/')) {
      const peeled = attrs.find(a => a.startsWith('peeled:'));
      refs.tags[ref.replace('refs/tags/', '')] = { sha, peeled: peeled ? peeled.replace('peeled:', '') : null };
    }
    const symref = attrs.find(a => a.startsWith('symref-target:'));
    if (symref) refs.head = { pointsTo: symref.replace('symref-target:', ''), sha };
  }
  return { protocolVersion: 2, objectFormat: capabilities.get('object-format') || 'sha1', capabilities: Object.fromEntries(capabilities), refs };
}
function parseV1Refs(buffer) {
  const capabilities = new Map();
  const refs = { branches: {}, tags: {}, head: null };
  let offset = 0, firstLine = true;
  while (offset < buffer.length) {
    const { data, length, isFlush } = parseSinglePktLine(buffer, offset);
    offset += length;
    if ((isFlush && firstLine) || !data) continue;
    const [sha, ref, capsStr] = data.split('\0');
    if (firstLine) {
      firstLine = false;
      if (ref === 'HEAD') refs.head = { pointsTo: null, sha };
      capsStr?.split(' ').forEach(cap => {
        const [key, value] = cap.split('=');
        capabilities.set(key, value || true);
      });
    }
    if (ref.startsWith('refs/heads/')) {
      const branchName = ref.replace('refs/heads/', '');
      refs.branches[branchName] = sha;
      if (refs.head && refs.head.sha === sha) refs.head.pointsTo = ref;
    } else if (ref.startsWith('refs/tags/')) {
      refs.tags[ref.replace('refs/tags/', '')] = { sha, peeled: data.includes('^{}') ? sha : null };
    }
  }
  return { protocolVersion: 1, objectFormat: capabilities.get('object-format') || 'sha1', capabilities: Object.fromEntries(capabilities), refs };
}
