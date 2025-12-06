/**
 * Write Git Upload Pack Request
 * Builds the request body for git-upload-pack service
 */
import { GitPktLine } from './GitPktLine.ts';

export interface UploadPackRequestOptions {
  capabilities?: string[];
  wants?: string[];
  haves?: string[];
  shallows?: string[];
  depth?: number | null;
  since?: Date | null;
  exclude?: string[];
  filter?: string | null;
  protocolVersion?: 1 | 2;
}

/**
 * Creates the request body for git-upload-pack
 */
export function writeUploadPackRequest(
  options: UploadPackRequestOptions = {}
): Uint8Array[] {
  const {
    capabilities = [],
    wants = [],
    haves = [],
    shallows = [],
    depth = null,
    since = null,
    exclude = [],
    filter = null,
    protocolVersion = 1,
  } = options;

  const packstream: Uint8Array[] = [];

  if (protocolVersion === 2) {
    // Protocol v2 format
    packstream.push(GitPktLine.encode('command=fetch\n'));
    const capList = capabilities.length > 0 ? ` ${capabilities.join(' ')}` : '';
    packstream.push(GitPktLine.encode(`agent=uvgit/1.0${capList}\n`));
    packstream.push(GitPktLine.delim());
  }

  // Remove duplicate wants
  const uniqueWants = [...new Set(wants)];
  let firstLineCapabilities =
    protocolVersion === 1 ? ` ${capabilities.join(' ')}` : '';

  for (const oid of uniqueWants) {
    packstream.push(
      GitPktLine.encode(`want ${oid}${firstLineCapabilities}\n`)
    );
    firstLineCapabilities = '';
  }

  for (const oid of shallows) {
    packstream.push(GitPktLine.encode(`shallow ${oid}\n`));
  }

  if (depth !== null && depth !== undefined) {
    packstream.push(GitPktLine.encode(`deepen ${depth}\n`));
  }

  if (since !== null && since !== undefined) {
    packstream.push(
      GitPktLine.encode(
        `deepen-since ${Math.floor(since.valueOf() / 1000)}\n`
      )
    );
  }

  for (const oid of exclude) {
    packstream.push(GitPktLine.encode(`deepen-not ${oid}\n`));
  }

  if (protocolVersion === 2 && filter) {
    packstream.push(GitPktLine.encode(`filter ${filter}\n`));
  }

  packstream.push(GitPktLine.flush());

  for (const oid of haves) {
    packstream.push(GitPktLine.encode(`have ${oid}\n`));
  }

  packstream.push(GitPktLine.encode('done\n'));

  return packstream;
}
