import fs from 'node:fs/promises';
import path from 'path';
import { defineConfig } from 'rollup';
import pkg from './package.json' with { type: 'json' };

const external = [
  'fs',
  'path',
  'crypto',
  'stream',
  'crc/lib/crc32.js',
  'sha.js/sha1',
  'sha.js/sha1.js',
  ...Object.keys(pkg.dependencies),
];

// Modern modules
const ecmaConfig = (input, output) => ({
  input: `${input}`,
  external: [...external],
  output: [
    {
      format: 'es',
      file: `${output}`,
    },
  ],
});

// // Legacy CommonJS2 modules
// TODO: Deprecate that in the docs and all over in favor of module-sync standard
// const nodeConfig = (input, output) => ({
//   input: `src/${input}`,
//   external: [...external],
//   output: [
//     {
//       format: 'cjs',
//       file: `${output}`,
//       exports: 'named',
//     },
//   ],
// })

// TODO: Deprecate that in the docs and all over in favor of module-sync standard
// Script tags that "export" a global var for those browser environments that
// still don't support `import` (Workers and ServiceWorkers)
// const umdConfig = (input, output, name) => ({
//   input: `src/${input}`,
//   output: [
//     {
//       format: 'umd',
//       file: `${output}`,
//       name,
//       exports: 'named',
//     },
//   ],
// })



// TODO: handle the name GitHttp Correct make own module or something see _name usage
// const pkgify = (input, output, _name) => {
//   fs.mkdirSync(path.join(import.meta.dirname, output), { recursive: true })
//   fs.writeFileSync(
//     path.join(import.meta.dirname, output, 'package.json'),
//     JSON.stringify(
//       {
//         type: 'module',
//         main: 'index.js'
//       },
//       null,
//       2
//     )
//   )
//   return [
//     ecmaConfig(`${input}/index.js`, `${output}/index.js`),
//   ]
// }

export default {
  input: {
    'index.js': 'src/index.js', 
    'internal-apis.js': 'src/internal-apis.js', 
    'managers.js': 'src/managers/index.js', 
    'models.js': 'src/models/index.js', 
    'http.js': 'src/http/web/index.js', 
  },
  external(id) {
    // All modules that do not come from us are external by definition.
    return id.includes('node_modules') && !id.includes('@isomorphic-git');
  }, //[...external],
  plugins: [
    {
      "name": "node-resolve",
      "description": "uses node module resolve to link types correct and add extensions as needed and so on.",
      async resolveId(source,importer,options) {
        // This should resolve existing files with extension as also extension less imports via the package.json mappings.		
        const resolution = await this.resolve(source, importer, options) || import.meta.resolve(source,importer);
        const exists = await fs.stat()
        // If it cannot be resolved or is external, just return it
        // so that Rollup can display an error
        if (resolution.external) return resolution;
      }
    }
  ],
  output: [
    {
      format: 'es',
      dir: import.meta.dirname,
    },
  ],
}
  
//   [
//   ecmaConfig('src/index.js', 'index.js'),
//   ecmaConfig('src/internal-apis.js', 'internal-apis.js'),
//   ecmaConfig('src/managers/index.js', 'managers.js'),
//   ecmaConfig('src/models/index.js', 'models.js'),
//   ecmaConfig('src/http/web/index.js', 'http.js'),
//   // ...pkgify('http/node', 'http/node'),
//   //...pkgify('http/web', 'http/web', 'GitHttp'),
// ]
