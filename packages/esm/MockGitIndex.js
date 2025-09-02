/**
 * @fileoverview A base class for Git storage backends with a universal type adapter factory.
 */

/**
 * @class
 * @abstract
 * Provides a common interface for different Git storage backends (e.g., filesystem, memory, HTTP).
 * This class is abstract and should be extended by concrete implementations.
 */
export class GitStorage {
  /**
   * Reads a git object (commit, tree, blob, etc.).
   * @abstract
   * @param {string} oid - The SHA-1 object ID.
   * @returns {Promise<{oid: string, type: string, object: Uint8Array}>} The git object.
   */
  async read(oid) {
    throw new Error('GitStorage.read() is an abstract method and must be implemented by a subclass.');
  }

  /**
   * Writes a git object.
   * @abstract
   * @param {string} oid - The SHA-1 object ID.
   * @param {Uint8Array} object - The raw object content.
   * @param {string} type - The object type (e.g., 'commit', 'tree').
   * @returns {Promise<void>}
   */
  async write(oid, object, type) {
    throw new Error('GitStorage.write() is an abstract method and must be implemented by a subclass.');
  }

  /**
   * A universal type adapter that creates an instance of a specific GitStorage subclass.
   *
   * @template {new (...args: any[]) => GitStorage} T - The specific GitStorage subclass constructor.
   * @param {T} backendConstructor - The constructor of the GitStorage backend to instantiate.
   * @param {ConstructorParameters<T>} options - The arguments to pass to the backend's constructor, correctly typed.
   * @returns {InstanceType<T>} An instance of the specified GitStorage subclass.
   */
  static from(backendConstructor, ...options) {
    if (typeof backendConstructor !== 'function' || !(backendConstructor.prototype instanceof GitStorage)) {
      throw new TypeError('The first argument must be a class constructor that extends GitStorage.');
    }
    return new backendConstructor(...options);
  }
}

// --- Example Subclasses ---

/**
 * An in-memory implementation of GitStorage.
 * @class
 * @extends {GitStorage}
 */
export class MemoryStorage extends GitStorage {
  /** @param {Map<string, {type: string, object: Uint8Array}>} [initialData] */
  constructor(initialData = new Map()) {
    super();
    /** @private */
    this.data = initialData;
  }
  /** @override */
  async read(oid) { /* ... implementation ... */ }
  /** @override */
  async write(oid, object, type) { /* ... implementation ... */ }
}

/**
 * A mock HTTP implementation of GitStorage.
 * @class
 * @extends {GitStorage}
 */
export class HttpStorage extends GitStorage {
  /** @param {string} url */
  constructor(url) {
    super();
    /* ... implementation ... */
  }
  /** @override */
  async read(oid) { /* ... implementation ... */ }
  /** @override */
  async write(oid, object, type) { throw new Error('Writing is not supported by HttpStorage.'); }
}

/**
 * A mock SQL database implementation of GitStorage.
 * In a real application, the `dbClient` would be a connection from a library like 'sqlite3' or 'pg'.
 * @class
 * @extends {GitStorage}
 */
export class SQLStorage extends GitStorage {
  /**
   * @typedef {object} DbClient
   * @property {(sql: string, params?: any[]) => Promise<any[]>} query - Executes a SQL query.
   */
  
  /**
   * @param {DbClient} dbClient - An object that can execute SQL queries.
   */
  constructor(dbClient) {
    super();
    if (!dbClient || typeof dbClient.query !== 'function') {
        throw new Error('A valid database client with a .query() method is required.');
    }
    /** @private */
    this.db = dbClient;
  }

  /**
   * Initializes the storage by ensuring the necessary table exists.
   * This should be called before any read/write operations.
   * @returns {Promise<void>}
   */
  async init() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS git_objects (
        oid TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        object BLOB NOT NULL
      );
    `;
    await this.db.query(createTableSQL);
  }

  /**
   * @override
   * @param {string} oid
   */
  async read(oid) {
    const selectSQL = `SELECT type, object FROM git_objects WHERE oid = ?;`;
    const rows = await this.db.query(selectSQL, [oid]);
    
    if (rows.length === 0) {
      throw new Error(`Object ${oid} not found in SQL database.`);
    }

    const { type, object } = rows[0];
    // Ensure the object is a Uint8Array, as some DB drivers might return Buffers or other types.
    return { oid, type, object: new Uint8Array(object) };
  }

  /**
   * @override
   * @param {string} oid
   * @param {Uint8Array} object
   * @param {string} type
   */
  async write(oid, object, type) {
    // 'INSERT OR REPLACE' is specific to SQLite. Other databases use different
    // "upsert" syntax (e.g., 'INSERT ... ON DUPLICATE KEY UPDATE' in MySQL).
    const upsertSQL = `INSERT OR REPLACE INTO git_objects (oid, type, object) VALUES (?, ?, ?);`;
    await this.db.query(upsertSQL, [oid, type, object]);
  }
}

class GitIndex {
    // Note this syntax makes sure it is never undefined! For TypeScript
    constructur({ stroage = new GitStorage() }) {
        this.gitStorage = stroage || new GitStorage()
    }
}


// --- A Mock Database Client for Demonstration ---
// This simulates a real database client by using an in-memory Map.
class MockDbClient {
  constructor() {
    /** @private @type {Map<string, {type: string, object: Uint8Array}>} */
    this._data = new Map();
    console.log('[MockDb] In-memory database initialized.');
  }

  /**
   * A mock query executor.
   * @param {string} sql
   * @param {any[]} [params]
   */
  async query(sql, params = []) {
    sql = sql.trim().toUpperCase();
    console.log(`[MockDb] Executing: ${sql.split('\n')[0].trim()}... with params:`, params);

    if (sql.startsWith('CREATE TABLE')) {
      // The table is "created" (our Map is ready).
      return [];
    }
    
    if (sql.startsWith('INSERT OR REPLACE')) {
      const [oid, type, object] = params;
      this._data.set(oid, { type, object });
      return [];
    }

    if (sql.startsWith('SELECT')) {
      const [oid] = params;
      if (this._data.has(oid)) {
        // Return data in the format a DB client would: an array of row objects.
        return [this._data.get(oid)];
      }
      return [];
    }

    throw new Error(`[MockDb] Unsupported SQL: ${sql}`);
  }
}


// --- Using the factory with the new SQL backend ---

async function main() {
  console.log('--- Testing SQLStorage ---');

  // 1. Create an instance of our mock database client.
  const mockDb = new MockDbClient();

  // 2. Use the factory to create an SQLStorage instance.
  // The type of `sqlBackend` is correctly inferred as `SQLStorage`.
  const sqlBackend = GitStorage.from(SQLStorage, mockDb);

  // 3. Initialize the database schema.
  await sqlBackend.init();

  // 4. Use the backend to write and read data.
  const oid = '1a2b3c4d5e';
  const data = new TextEncoder().encode('This is a test git object.');
  
  console.log(`\nWriting object ${oid} to SQL backend...`);
  await sqlBackend.write(oid, data, 'blob');
  
  console.log(`Reading object ${oid} from SQL backend...`);
  const result = await sqlBackend.read(oid);

  console.log('Read result:', {
    ...result,
    object: new TextDecoder().decode(result.object), // Decode for readability
  });
  
  console.log('Successfully created and used SQL backend:', sqlBackend instanceof SQLStorage);

  // You can still create other backends just as easily:
  console.log('\n--- Testing MemoryStorage ---');
  const memoryBackend = GitStorage.from(MemoryStorage);
  console.log('Successfully created memory backend:', memoryBackend instanceof MemoryStorage);
}

main().catch(console.error);

// Generate OID
    // magic number for empty tree commit 
    // oid: parent || '4b825dc642cb6eb9a060e54bf8d69288fbee4904',

// Everything that is part of the worktree but not part of the GitIndex is part of cache!
// GitIndex.add depends on GitIgnore Knowledge to show information if not force used.           
// autocrlf, gets handled on add but executed on commit. so we need GitConfig Knowledge
// also for information how to write LFS the SQL Backend can handle them easy.
// Also removing them from history is easy if needed if they are to large. 

// GitIndex uses a git unaware storage backend that also stores worktrees and caches.


async function demonstrateTreeStorage() {
  console.log('--- Demonstrating Tree Object Storage ---');
  
  // OIDs are 20 bytes long in SHA-1. We'll use mock byte arrays.
  const oid_A = new Uint8Array(20).fill(0xAA); // Mock OID for run.sh
  const oid_B = new Uint8Array(20).fill(0xBB); // Mock OID for README.md

  // Manually construct the raw content for a tree object.
  // The format is: `${mode} ${filename}\0${binary_oid}` repeated for each entry.
  // The '\0' is a null character.
  const mode_executable = '100755 ';
  const mode_normal = '100644 ';
  const filename_A = 'run.sh\0';
  const filename_B = 'README.md\0';

  // We need to concatenate these parts into a single Uint8Array.
  const encoder = new TextEncoder();
  
  const part1 = encoder.encode(mode_normal + filename_B);
  const part2 = oid_B;
  const part3 = encoder.encode(mode_executable + filename_A);
  const part4 = oid_A;

  // Concatenate all the pieces into a single byte array.
  const treeObjectContent = new Uint8Array(part1.length + part2.length + part3.length + part4.length);
  treeObjectContent.set(part1, 0);
  treeObjectContent.set(part2, part1.length);
  treeObjectContent.set(part3, part1.length + part2.length);
  treeObjectContent.set(part4, part1.length + part2.length + part3.length);

  // In a real git implementation, you would calculate the SHA-1 of this content
  // (prefixed with "tree " + length + "\0") to get the tree's actual OID.
  const treeOid = 'mock_tree_oid_12345';

  // --- Use our storage backend ---
  const storage = GitStorage.from(MemoryStorage);

  console.log(`\nWriting raw tree object with OID: ${treeOid}`);
  
  // Our storage class correctly handles this raw binary blob.
  await storage.write(treeOid, treeObjectContent, 'tree');

  console.log('Reading raw tree object back from storage...');
  const { object: rawObjectFromStorage } = await storage.read(treeOid);

  console.log('Raw bytes read:', rawObjectFromStorage);
  
  // A higher-level function would be responsible for parsing these bytes.
  // For example: GitTree.parse(rawObjectFromStorage) would return:
  // [
  //   { mode: '100644', name: 'README.md', oid: 'bbbb...' },
  //   { mode: '100755', name: 'run.sh', oid: 'aaaa...' }
  // ]
  console.log('\nConclusion: The GitStorage class correctly stores the raw object,');
  console.log('which includes all necessary metadata like file modes.');
}

demonstrateTreeStorage();

const GitTree =  [
   { mode: '100644', name: 'README.md', oid: 'bbbb...' },
   { mode: '100755', name: 'run.sh', oid: 'aaaa...' }
]


// Pack algo
/**
 * A utility to concatenate multiple Uint8Arrays into a single new one.
 * @param {Uint8Array[]} arrays An array of Uint8Arrays to concatenate.
 * @returns {Uint8Array} The concatenated result.
 */
function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converts a hex string into a Uint8Array.
 * @param {string} hex The hex string. Must have an even number of characters.
 * @returns {Uint8Array}
 */
function hexToUint8Array(hex) {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of characters.');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Pads a number with leading zeros to create a hex string of a specific length.
 * @param {number} len The total length of the final hex string.
 * @param {number} num The number to convert.
 * @returns {string}
 */
function padHex(len, num) {
  return num.toString(16).padStart(len, '0');
}



/**
 * Creates a Git packfile from a list of object IDs, yielding chunks as an async generator.
 * This is memory-efficient and provides a flexible, standard primitive for consumers.
 *
 * @param {object} args
 * @param {any} args.fs - A filesystem interface.
 * @param {any} args.cache - A cache object.
 * @param {string} args.dir - The path to the working directory.
 * @param {string} [args.gitdir] - The path to the .git directory.
 * @param {string[]} args.oids - An array of object IDs to include in the pack.
 * @returns {AsyncGenerator<Uint8Array>} An async generator that yields the packfile data in Uint8Array chunks.
 */
export async function* _pack({
  fs,
  cache,
  dir,
  gitdir = join(dir, '.git'), // Assuming `join` is a path utility
  oids,
}) {
  const hash = new Hash();
  const encoder = new TextEncoder();

  /**
   * A helper function to yield a chunk and update the hash simultaneously.
   * @param {Uint8Array} chunk - The data chunk to process.
   */
  function yieldAndHash(chunk) {
    hash.update(chunk);
    return chunk;
  }

  /**
   * A helper async generator that encodes a single git object.
   * This keeps the main loop clean and composes nicely with `yield*`.
   * @param {{ stype: string; object: Uint8Array }} args
   * @returns {AsyncGenerator<Uint8Array>}
   */
  async function* encodeObject({ stype, object }) {
    const type = types[stype];
    let length = object.length;
    let multibyte = length > 0b1111 ? 0b10000000 : 0b0;
    const lastFour = length & 0b1111;
    length = length >>> 4;

    yield new Uint8Array([multibyte | type | lastFour]);

    while (multibyte) {
      multibyte = length > 0b01111111 ? 0b10000000 : 0b0;
      yield new Uint8Array([multibyte | (length & 0b01111111)]);
      length = length >>> 7;
    }

    yield await deflate(object);
  }

  try {
    // --- Main packfile stream generation ---

    // 1. Yield header, version, and object count.
    yield yieldAndHash(encoder.encode('PACK'));
    yield yieldAndHash(hexToUint8Array('00000002'));
    yield yieldAndHash(hexToUint8Array(padHex(8, oids.length)));

    // 2. Stream each object's data.
    for (const oid of oids) {
      const { type, object } = await readObject({ fs, cache, gitdir, oid });
      
      // Use `for await...of` to iterate through the object encoder generator.
      // This is the core of the streaming logic.
      for await (const chunk of encodeObject({ stype: type, object })) {
        yield yieldAndHash(chunk);
      }
    }

    // 3. All data has been hashed. Now yield the final checksum.
    // This chunk is NOT hashed itself.
    yield hash.digest();

  } catch (err) {
    // If any error occurs, the generator will throw, and the consumer's
    // `for await...of` loop will reject, which is the standard error handling mechanism.
    console.error("Error during packfile generation:", err);
    throw err;
  }
}


// Assume `GitPackfile.pack()` returns an AsyncGenerator<Uint8Array> or a ReadableStream<Uint8Array>.
// Assume a helper `generatorToReadableStream` exists if needed.

class GitRemoteHTTP {
  /**
   * Transmits the update commands and the packfile to the remote server.
   * This is the core of the `git push` operation over HTTP.
   *
   * @param {string} remoteUrl - The base URL of the remote repository.
   * @param {object} pushData
   * @param {Array<{oldOid: string, newOid: string, refName: string}>} pushData.commands - The ref updates to perform.
   * @param {ReadableStream<Uint8Array>} pushData.packfileStream - A stream of the bundled Git objects.
   * @returns {Promise<{ok: boolean, error?: string}>} The result of the push operation.
   */
  static async transmitPackfile(remoteUrl, { commands, packfileStream }) {
    const serviceUrl = `${remoteUrl}/git-receive-pack`;

    // --- Step 1: Create the command payload (the first part of the request body) ---
    const encoder = new TextEncoder();
    
    // The first command includes capabilities. For simplicity, we'll omit most.
    // The null character `\0` is a required separator.
    const firstCommand = `${commands[0].oldOid} ${commands[0].newOid} ${commands[0].refName}\0report-status`;
    const commandLines = [
      this.#createPktLine(firstCommand)
    ];

    // Add any other commands.
    for (let i = 1; i < commands.length; i++) {
      const cmd = commands[i];
      const commandStr = `${cmd.oldOid} ${cmd.newOid} ${cmd.refName}`;
      commandLines.push(this.#createPktLine(commandStr));
    }

    // After the commands, we send a "flush" packet to signal the end of the command list.
    commandLines.push('0000');

    const commandPayload = encoder.encode(commandLines.join(''));

    // --- Step 2: Stitch the command payload and the packfile stream together ---
    const requestBodyStream = new ReadableStream({
      async start(controller) {
        // First, enqueue the command part. This is small and sent in one chunk.
        controller.enqueue(commandPayload);
        
        // Now, pipe the packfile stream directly after it.
        const reader = packfileStream.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            // The packfile is finished, so our combined stream is also done.
            controller.close();
            break;
          }
          // Pass the packfile chunk through to the outgoing request.
          controller.enqueue(value);
        }
      }
    });

    // --- Step 3: Execute the fetch request ---
    print("   - Sending POST request with streaming body...");
    
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-git-receive-pack-request',
        'Accept': 'application/x-git-receive-pack-result',
      },
      body: requestBodyStream,
      // The `duplex: 'half'` option is required for streaming request bodies
      // in some environments (like Node.js's implementation of fetch).
      // It tells the server that we are sending data but also expecting a response.
      // @ts-ignore
      duplex: 'half',
    });

    // --- Step 4: Parse the server's response ---
    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: `HTTP Error: ${response.status} ${response.statusText}\n${errorText}` };
    }

    // The response is also in pkt-line format. A successful push will contain "unpack ok".
    const responseText = await response.text();
    if (responseText.includes('unpack ok')) {
      return { ok: true };
    } else {
      // The response text will contain the reason for rejection (e.g., "ng" for "not good").
      return { ok: false, error: `Push rejected by remote:\n${responseText}` };
    }
  }

  /**
   * Helper to encode a string into the pkt-line format.
   * Format: 4-byte hex length prefix + content.
   * @private
   */
  static #createPktLine(str) {
    // The +4 accounts for the length of the hex prefix itself.
    const length = new TextEncoder().encode(str).length + 4;
    const hexLength = length.toString(16).padStart(4, '0');
    return `${hexLength}${str}`;
  }
}

/**
 * An async generator that parses a ReadableStream of Uint8Arrays in pkt-line format.
 * It correctly handles chunking and buffering of network data.
 *
 * @param {ReadableStream<Uint8Array>} stream - The input stream, e.g., from a `fetch` response body.
 * @returns {AsyncGenerator<Uint8Array | null>}
 *          An async generator that yields:
 *          - `Uint8Array` for each data line's payload.
 *          - `null` for a flush packet ('0000').
 */
export async function* parsePktLineStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.length > 0) {
          console.warn('Stream ended with incomplete data in buffer.');
        }
        break;
      }

      // Append new data to our internal buffer.
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      // Process all complete lines that are now in the buffer.
      while (buffer.length >= 4) {
        const lengthHex = decoder.decode(buffer.slice(0, 4));
        const length = parseInt(lengthHex, 16);

        if (isNaN(length)) {
          throw new Error(`Invalid pkt-line length prefix: "${lengthHex}"`);
        }

        // Check for flush packet.
        if (length === 0) {
          yield null;
          buffer = buffer.slice(4);
          continue; // Continue processing the rest of the buffer.
        }

        // If we have a full packet in the buffer, process it.
        if (buffer.length >= length) {
          // The payload is the data between the prefix and the end of the packet.
          yield buffer.slice(4, length);
          // The buffer is now the data that came after this packet.
          buffer = buffer.slice(length);
        } else {
          // Not enough data for a full packet, break the inner loop and wait for more data.
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Example Usage with a Mock Stream ---

// async function testStreamParser() {
//   console.log('\n--- Testing parsePktLineStream ---');

//   // Create a mock stream that delivers data in awkward chunks.
//   const encoder = new TextEncoder();
//   const mockStream = new ReadableStream({
//     start(controller) {
//       controller.enqueue(encoder.encode('001e# service=git-upload-pack\n0000')); // First line + flush
//       controller.enqueue(encoder.encode('003f75c')); // Incomplete line part 1
//       controller.enqueue(encoder.encode('a2f84b00859b4009a4a3504a32a6839e5a')); // Part 2
//       controller.enqueue(encoder.encode('6b69b refs/heads/main\n')); // Part 3
//       controller.close();
//     }
//   });

//   // Consume the stream using the parser.
//   for await (const payload of parsePktLineStream(mockStream)) {
//     if (payload === null) {
//       console.log('Received a flush packet.');
//     } else {
//       console.log('Received payload:', `"${decoder.decode(payload).trim()}"`);
//     }
//   }
//   console.log('Stream finished.');
// }

// testStreamParser();