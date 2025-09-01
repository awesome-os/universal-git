// --- Shared Building Blocks ---

// 1. Common compiler/linker options used across all configurations
const SHARED_OPTIONS = {
  opt: '-O3 -march=native -mtune=native -std=c++20 -c -fno-omit-frame-pointer -fno-rtti -fno-exceptions',
  v8_opts: {
    v8_cleanup: 0,
    v8_threads: 2,
    on_exit: 0,
    v8flags: '--stack-trace-limit=10 --use-strict --turbo-fast-api-calls --no-freeze-flags-after-init',
  },
  // Determine link type once, based on the current OS
  link_type: `-rdynamic${lo.core.os === 'linux' ? ' -static-libgcc -static-libstdc++' : ''}`,
  target: 'lo',
};

// 2. The "base" set of files and bindings
const BASE_LIBS = [
  'lib/build.js', 'lib/curl.js', 'lib/fs.js', 'lib/gen.js', 'lib/inflate.js',
  'lib/path.js', 'lib/proc.js', 'lib/stringify.js', 'lib/untar.js',
];
const BASE_EMBEDS = [
  'globals.d.ts', 'lo.cc', 'lo.h', 'main.cc', 'main.h',
  'lib/core/api.js', 'lib/curl/api.js', 'lib/inflate/api.js', 'lib/inflate/build.js',
  'runtime/base.config.js', 'runtime/core.config.js', 'runtime/lo.config.js',
];
const BASE_BINDINGS = [
  'core', 'curl', 'inflate', { mach: ['mac'] },
];

// 3. Additional files for the "full" configuration
const FULL_ADDITIONAL_LIBS = [
  'lib/ansi.js', 'lib/asm.js', 'lib/asm/assembler.js', 'lib/asm/compiler.js',
  'lib/bench.js', 'lib/bench.mjs', 'lib/binary.js', 'lib/dns.js', 'lib/dns/protocol.js',
  'lib/elf.js', 'lib/ffi.js', 'lib/hash.js', 'lib/html.js', 'lib/libssl.js', 'lib/loop.js',
  'lib/net.js', 'lib/packet.js', 'lib/pico.js', 'lib/pmon.js', 'lib/repl.js', 'lib/sni.js',
  'lib/socket.js', 'lib/sqlite.js', 'lib/system.js', 'lib/thread.js', 'lib/timer.js',
  'lib/udp.js', 'lib/worker.js', 'lib/zlib.js'
];
const FULL_ADDITIONAL_EMBEDS = [
  'lib/bestlines/api.js', 'lib/bestlines/build.js', 'lib/cfzlib/api.js', 'lib/cfzlib/build.js',
  'lib/encode/api.js', 'lib/libssl/api.js', 'lib/libssl/build.js', 'lib/pthread/api.js',
  'lib/sqlite/api.js', 'lib/sqlite/build.js', 'lib/system/api.js'
];
const FULL_ADDITIONAL_BINDINGS = [
  'bestlines', 'encode', 'libssl', 'net', 'pico', 'pthread', 'sqlite', 'system',
  { 'epoll': ['linux'] }, { 'kevents': ['mac'] }
];

// --- Final Composed Configurations ---

/**
 * tsconfig.json definition
 */
export const tsConfig = {
  files: ['main.js'],
  compilerOptions: {
    paths: { lib: ['./lib'] },
    types: [],
    target: 'es2022',
    lib: ['es2023'],
    outDir: 'dist',
    allowJs: true,
    checkJs: true,
    strict: true,
    noImplicitAny: false,
    isolatedModules: true,
    noEmit: false,
    module: 'es2022',
  },
  exclude: ['scratch', 'v8', '.vscode', '.git', '.github'],
  include: ['globals.d.ts', 'lib/*.js', 'lib/asm/*.js', 'lib/dns/*.js', '.'],
};

/**
 * Core Config: The absolute minimal runtime.
 */
export const coreConfig = {
  ...SHARED_OPTIONS,
  bindings: ['core'],
  libs: [],
  embeds: [],
};

/**
 * Base Config: A useful minimal runtime with basic file system, build, and networking tools.
 */
export const baseConfig = {
  ...SHARED_OPTIONS,
  bindings: BASE_BINDINGS,
  libs: BASE_LIBS,
  embeds: BASE_EMBEDS,
};

/**
 * Full "lo" Config: The kitchen sink. Includes all bindings and libraries for a full-featured runtime.
 */
export const loConfigFull = {
  ...SHARED_OPTIONS,
  bindings: [...new Set([...BASE_BINDINGS, ...FULL_ADDITIONAL_BINDINGS])],
  libs: [...new Set([...BASE_LIBS, ...FULL_ADDITIONAL_LIBS])],
  embeds: [...new Set([...BASE_EMBEDS, ...FULL_ADDITIONAL_EMBEDS])],
};

/**
### The Full Story

1.  **The Comment is Correct (Historically):** The file you're looking at (`main.h` or `builtins.h`) was, 
    at some point, automatically generated. The comment is a warning left by the original author for future developers.

2.  **The Makefile Line is the Generator:** The line we found is **exactly** the one the comment refers to:
    ```makefile
    #builtins.h: main.js
    #	./lo .\gen.js main.js > builtins.h
    ```
    This command runs a generator script (`gen.js`) using the runtime itself (`lo`) to produce the header file.

3.  **The "Chicken-and-Egg" Problem:** The developers likely ran into a classic build problem.
    *   To build `lo`, you need the header file (`builtins.h`).
    *   To generate the header file, you need the `lo` executable to already exist.
    *   How do you build `lo` for the very first time on a clean machine? You can't.

4.  **The Solution: Check In the Generated File:** To solve this, developers use a common workflow:
    *   They run the generator command **once manually** on their machine.
    *   They take the output file (`builtins.h`) and **commit it directly to the source code repository** (like Git).
    *   They then **comment out the generation rule in the Makefile**.

### What This Means For You

*   The comment `// This file has been automatically generated...` is a **historical artifact**. It's a "fossil" from a time when the build process was different.
*   The build system **no longer generates this file automatically**. It now relies on the version that is saved in your project's source code.
*   This makes the project easier for new people to build. They can just clone the repository and run `make` without needing to worry about a special pre-build step.

### What If You Need to Re-generate It?

The comment also tells you what to do if you need to update this file (for example, if you make changes to `main.js` that need to be reflected in the C++ header).

You would need to "disable auto-generation" (which is already done since it's commented out) and run the command manually.

**To re-generate the file, you would:**

1.  Make sure you have a working `lo` executable already built.
2.  Run the command from your terminal:
    ```bash
    ./lo gen.js main.js > builtins.h
    ```
    *(Note: You might need to adjust the command slightly, for example using `lo.exe` on Windows or specifying the correct path to `gen.js`)*.
3.  This will overwrite the existing `builtins.h` with a newly generated version based on the current state of `main.js`.

**In summary: The line you're looking for is absolutely `#	./lo .\gen.js main.js > builtins.h`. It is currently disabled, and the comment in your header file is a leftover from when that line was active.**
 */
const getMain = (modules=[]) =>{
const includeHeaders = [
    process.platform.startsWith("w") ? "main_win.h" : "main.h",
    "<fcntl.h>"
]
    // #if defined(_WIN64)
// #include "main_win.h"
// #else
// #include "main.h"
// #endif

// #include <fcntl.h>


return `// #if defined(_WIN64)
// #include "main_win.h"
// #else
// #include "main.h"
// #endif

// #include <fcntl.h>

${includeHeaders}

int main(int argc, char** argv) {
  // if we are called with no arguments, just dump the version and exit
  if (argc == 2 && strncmp(argv[1], "--version", 9) == 0) {
    fprintf(stdout, "%s\n", VERSION);
    return 0;
  }
  // record the start time - this will be made available to JS so we can 
  // measure time to bootstrap the runtime
  uint64_t starttime = lo::hrtime();
  // turn off buffering of stdout and stderr - this is required by V8
  // https://en.cppreference.com/w/c/io/setvbuf
  setvbuf(stdout, nullptr, _IONBF, 0);
  setvbuf(stderr, nullptr, _IONBF, 0);

  lo::Setup(&argc, argv, v8flags, _v8_threads, _v8flags_from_commandline);

  // register any builtins and modules that have been generated in main.h 
  register_builtins();
  // create a new isolate on the main thread. this will block until the 
  // isolate exits
  lo::CreateIsolate(argc, argv, main_js, main_js_len, index_js, index_js_len, 0,
    0, 0, starttime, RUNTIME, "main.js", _v8_cleanup, _on_exit, nullptr);

  lo_shutdown(_v8_cleanup);
  return 0;
}`;
}


import { execSync } from 'child_process';
import { existsSync, rmSync, mkdirSync, unlinkSync } from 'fs';
import { platform, arch } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// --- Helper Functions ---
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Executes a command and prints it to the console.
 * @param {string} command The command to execute.
 * @param {import('child_process').ExecSyncOptions} options
 */
function run(command, options = {}) {
  console.log(`\x1b[33m$ ${command}\x1b[0m`);
  try {
    execSync(command, { stdio: 'inherit', cwd: __dirname, ...options });
  } catch (error) {
    console.error(`\x1b[31mCommand failed: ${command}\x1b[0m`);
    process.exit(1);
  }
}

/**
 * Ensures a directory exists.
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// --- Configuration (Translated from Makefile Variables) ---

const C = {
  VERSION: '0.0.18-pre',
  V8_VERSION: '12.9',
  RUNTIME: 'lo',
  OPT: '-O3',
  WARN: ['-Werror', '-Wpedantic', '-Wall', '-Wextra', '-Wno-unused-parameter'],
  V8_FLAGS: [
    '-DV8_COMPRESS_POINTERS',
    '-DV8_TYPED_ARRAY_MAX_SIZE_IN_HEAP=64',
    '-DV8_INTL_SUPPORT=1',
  ],
  LIBS: ['-ldl', '-lcurl', '-lssl', '-lz'],
  BINDINGS: ['core.o', 'inflate.a', 'curl.o'],
  CC: 'clang',
  CXX: 'clang++',
  LINK: 'clang++',
  LARGS: ['-rdynamic', '-pthread', '-static-libstdc++'],
  CCARGS: ['-std=c++20', '-c', '-fno-omit-frame-pointer', '-fno-rtti', '-fno-exceptions'],
  CARGS: ['-c', '-fno-omit-frame-pointer'],
  LIB_DIRS: [],
  os: '',
  ARCH: arch(), // e.g., 'x64', 'arm64'
};

// --- Platform-Specific Adjustments ---

switch (platform()) {
  case 'win32':
    C.os = 'win';
    break;
  case 'darwin':
    C.os = 'mac';
    C.BINDINGS.push('mach.o');
    C.LARGS.push('-s', '-w');
    C.LIB_DIRS.push('-L"/opt/homebrew/lib"');
    if (C.ARCH === 'arm64') {
      C.LARGS.push('-arch arm64');
      C.CARGS.push('-arch arm64');
      C.CCARGS.push('-arch arm64');
    }
    break;
  case 'linux':
  default:
    C.os = 'linux';
    C.LARGS.push('-s', '-static-libgcc');
    C.CC = 'gcc';
    C.CXX = 'g++';
    C.LINK = 'g++';
    break;
}

C.TARGET = C.os === 'win' ? `${C.RUNTIME}.exe` : C.RUNTIME;

// --- Build Tasks (Translated from Makefile Targets) ---

const completedTasks = new Set();
const tasks = {
  help() {
    console.log('Usage: node build.mjs [target]\n\nAvailable targets:');
    for (const [name, { description }] of Object.entries(this)) {
      if (description) {
        console.log(`  \x1b[36m${name.padEnd(20, ' ')}\x1b[0m ${description}`);
      }
    }
  },

  async 'v8/include'() {
    this.description = 'Download the V8 headers';
    if (existsSync('v8/include')) return;
    ensureDir('v8');
    console.log('Downloading V8 headers...');
    run(`curl -L -o v8-include.tar.gz https://github.com/just-js/v8/releases/download/${C.V8_VERSION}/include.tar.gz`);
    run('tar -xvf v8-include.tar.gz');
    if (C.os !== 'win') {
      run('rm -f v8-include.tar.gz');
    }
  },

  async 'v8/lib'() {
    this.description = 'Download the V8 static library for the current OS';
    await this['v8/include']();
    if (C.os === 'win') {
      if (existsSync('v8/v8_monolith.lib')) return;
      run(`curl -C - -L -o v8/v8_monolith.lib.zip https://github.com/just-js/v8/releases/download/${C.V8_VERSION}/libv8_monolith-${C.os}-${C.ARCH}.zip`);
      run('unzip v8/v8_monolith.lib.zip', { cwd: join(__dirname, 'v8')});
    } else {
      if (existsSync('v8/libv8_monolith.a')) return;
      run(`curl -C - -L -o v8/libv8_monolith.a.gz https://github.com/just-js/v8/releases/download/${C.V8_VERSION}/libv8_monolith-${C.os}-${C.ARCH}.a.gz`);
      run('gzip -d v8/libv8_monolith.a.gz');
    }
  },

  async compileObjects() {
    this.description = 'Compile all C/C++/asm source files into object files';
    if (completedTasks.has('compileObjects')) return;
    
    // main.o
    run(`${C.CXX} ${C.CCARGS.join(' ')} ${C.OPT} -DRUNTIME='"${C.RUNTIME}"' -DVERSION='"${C.VERSION}"' -I./v8 -I./v8/include ${C.WARN.join(' ')} ${C.V8_FLAGS.join(' ')} -o main.o main.cc`);
    
    // runtime.o
    run(`${C.CXX} ${C.CCARGS.join(' ')} ${C.OPT} -DRUNTIME='"${C.RUNTIME}"' -DVERSION='"${C.VERSION}"' ${C.V8_FLAGS.join(' ')} -I./v8 -I./v8/include ${C.WARN.join(' ')} -o ${C.RUNTIME}.o ${C.RUNTIME}.cc`);

    // builtins.o
    const builtinSource = C.os === 'linux' ? 'builtins_linux.S' : 'builtins.S';
    run(`${C.CC} ${C.CARGS.join(' ')} ${builtinSource} -o builtins.o`);

    // bindings
    run(`${C.CXX} -fPIC ${C.CCARGS.join(' ')} ${C.OPT} -I. -I./v8 -I./v8/include ${C.WARN.join(' ')} ${C.V8_FLAGS.join(' ')} -o core.o lib/core/core.cc`);
    run(`${C.CXX} -fPIC ${C.CCARGS.join(' ')} ${C.OPT} -I. -I./v8 -I./v8/include ${C.WARN.join(' ')} ${C.V8_FLAGS.join(' ')} -o curl.o lib/curl/curl.cc`);
    if (C.os === 'mac') {
      run(`${C.CXX} -fPIC ${C.CCARGS.join(' ')} ${C.OPT} -I. -I./v8 -I./v8/include ${C.WARN.join(' ')} ${C.V8_FLAGS.join(' ')} -o mach.o lib/mach/mach.cc`);
    }

    // inflate binding
    ensureDir('lib/inflate');
    if (!existsSync('lib/inflate/em_inflate.h')) run('curl -L -o lib/inflate/em_inflate.h https://raw.githubusercontent.com/emmanuel-marty/em_inflate/master/lib/em_inflate.h');
    if (!existsSync('lib/inflate/em_inflate.c')) run('curl -L -o lib/inflate/em_inflate.c https://raw.githubusercontent.com/emmanuel-marty/em_inflate/master/lib/em_inflate.c');
    run(`${C.CC} -fPIC ${C.CARGS.join(' ')} ${C.OPT} -I. -I./v8 -I./v8/include -Ilib/inflate -o lib/inflate/em_inflate.o lib/inflate/em_inflate.c`);
    run(`${C.CXX} -fPIC ${C.CCARGS.join(' ')} ${C.OPT} -I. -I./v8 -I./v8/include -Ilib/inflate ${C.WARN.join(' ')} ${C.V8_FLAGS.join(' ')} -o inflate.o lib/inflate/inflate.cc`);
    run('ar crsT inflate.a inflate.o lib/inflate/em_inflate.o');
    
    completedTasks.add('compileObjects');
  },

  async build() {
    this.description = 'Build the final executable';
    await this['v8/lib']();
    
    if (C.os === 'win') {
      // Windows build logic with 'cl'
      const clArgs = ['/EHsc', '/std:c++20', `/DRUNTIME='"${C.RUNTIME}"'`, `/DVERSION='"${C.VERSION}"'`, '/I.', '/I./v8', '/I./v8/include', '/c', C.V8_FLAGS.join(' ')].join(' ');
      run(`cl ${clArgs} main.cc`);
      run(`cl ${clArgs} ${C.RUNTIME}.cc`);
      run(`cl /EHsc /std:c++20 /I. /I./v8 /I./v8/include /c core.cc`);
      run(`cl v8/v8_monolith.lib ${C.RUNTIME}.obj main.obj core.obj winmm.lib dbghelp.lib advapi32.lib /link /out:${C.TARGET}`);
    } else {
      // Linux/macOS build logic
      await this.compileObjects();
      console.log(`Building ${C.TARGET} for ${C.os} on ${C.ARCH}...`);
      const command = [
        C.LINK,
        C.LARGS.join(' '),
        C.OPT,
        'main.o',
        `${C.RUNTIME}.o`,
        'builtins.o',
        C.BINDINGS.join(' '),
        C.LIBS.join(' '),
        `-o ${C.TARGET}`,
        '-L"./v8"',
        '-lv8_monolith',
        C.LIB_DIRS.join(' '),
      ].join(' ');
      run(command);
    }
  },
  
  async check() {
    this.description = 'Run runtime sanity tests';
    await this.build();
    run(`./${C.TARGET} test/runtime.js`);
    run(`./${C.TARGET} test/dump.js`);
  },

  async clean() {
    this.description = 'Remove compiled object files and the executable';
    console.log('Cleaning build artifacts...');
    const extensions = C.os === 'win' ? ['.obj', '.exe', '.exp', '.lib'] : ['.o', '.a'];
    const files = [
        ...C.BINDINGS, 'main.o', `${C.RUNTIME}.o`, 'builtins.o', C.TARGET,
        'mach.o', 'inflate.o', 'lib/inflate/em_inflate.o'
    ];

    for (const file of files) {
        for (const ext of extensions) {
            if (file.endsWith(ext)) {
                try { unlinkSync(file) } catch(e) {}
            }
        }
    }
    try { unlinkSync(C.TARGET); } catch(e) {}
    if (C.os !== 'win') {
        run('rm -f *.a lib/**/*.a lib/**/*.o lib/**/*.so');
    }
  },

  async cleanall() {
    this.description = 'Run clean and also remove the v8 directory';
    await this.clean();
    console.log('Removing v8 directory...');
    if (existsSync('v8')) {
      rmSync('v8', { recursive: true, force: true });
    }
  },
};

// --- Main Execution Logic ---
async function main() {
  const target = process.argv[2] || 'build';

  if (tasks[target]) {
    await tasks[target]();
  } else {
    console.error(`\x1b[31mUnknown target: ${target}\x1b[0m`);
    tasks.help();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * takes lo/modules and bindings executes compile and run.
 */