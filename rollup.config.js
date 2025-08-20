import fs from 'fs'
import path from 'path'
import { defineConfig } from 'rollup';
import pkg from './package.json'

const external = [
  'fs',
  'path',
  'crypto',
  'stream',
  'crc/lib/crc32.js',
  'sha.js/sha1',
  'sha.js/sha1.js',
  ...Object.keys(pkg.dependencies),
]

// Modern modules
const ecmaConfig = (input, output) => ({
  input: `src/${input}`,
  external: [...external],
  output: [
    {
      format: 'es',
      file: `${output}`,
    },
  ],
})

// Script tags that "export" a global var for those browser environments that
// still don't support `import` (Workers and ServiceWorkers)
const umdConfig = (input, output, name) => ({
  input: `src/${input}`,
  output: [
    {
      format: 'umd',
      file: `${output}`,
      name,
      exports: 'named',
    },
  ],
})

const template = umd =>
  JSON.stringify(
    {
      type: 'module',
      main: 'index.js',
      typings: 'index.d.ts',
      unpkg: umd ? 'index.umd.js' : undefined,
    },
    null,
    2
  )

const pkgify = (input, output, name) => {
  fs.mkdirSync(path.join(__dirname, output), { recursive: true })
  fs.writeFileSync(
    path.join(__dirname, output, 'package.json'),
    template(!!name)
  )
  return [
    ecmaConfig(`${input}/index.js`, `${output}/index.js`),
    ...(name
      ? [umdConfig(`${input}/index.js`, `${output}/index.umd.js`, name)]
      : []),
  ]
}


const virtualModules = {
  "internal-api": `export * from './index.js';`,
  "managers": `export { GitManager } from './index.js';`,
  "models": `export { FileSystem } from './index.js'`,
}

const hotFixFiles = {
  ...virtualModules,
  "internal-api.d.ts": `export * from './index';`,
  "managers.d.ts": `export { GitManager } from './index';`,
  "models.d.ts": `export { FileSystem } from './index'`,
};

export default [
  // TODO: Fix Types normal this should be  a single input object that uses preserveModuleRoot then we can generate the matching types
  // TODO: At present when this packages would get individual used this would lead to all kinds of failures as they all eg: export own 
  // TODO: versions of eg GitManager and so on so new GitManager from index is not the same as from managers/index.js
  ecmaConfig('index.js', 'index.js'),
  // ecmaConfig('internal-apis.js', 'internal-apis.js'),
  // ecmaConfig('managers/index.js', 'managers/index.js'),
  // ecmaConfig('models/index.js', 'models/index.js'),
  ...pkgify('http/node', 'http/node'),
  ...pkgify('http/web', 'http/web', 'GitHttp'),
  defineConfig({
    input: ['./index.js',
    // TODO: Enable when virtual gets enabled and hotFixRemoved 'managers','internal-api'
    ],
    external: (id) => id.includes('node_modules'),
    plugins: [    
      // TODO: hotfix would be to build a single file ESM Bundle and reexport from that.
      // This emits wrappers as we did expose files without types and fixing takes weeks
      // TODO: see below remove this hotfix.
      {
        name: 'virtual-asset',
        buildStart() {
          Object.entries(hotFixFiles).forEach((moduleName,source)=>{
            const fileName = moduleName + moduleName.includes('.') ? "" : '.js';
            this.emitFile({ type: 'asset', fileName, source });
          });
        }
      }
    // TODO: make type emit compatible to this structure then enable virtual module till all works
    // This is for dev only at present npm install @rollup/plugin-virtual --save-dev
    // import virtual from '@rollup/plugin-virtual';
    // virtual(virtualModules)
    ],
    output: {
      format: 'es',
      dir: `packages/isomorphic-git/dist`,
      chunkFileNames: "[name].js",
      minifyInternalExports: false,
      preserveModules: false,
			preserveModulesRoot: 'src'
    },
  })
];
