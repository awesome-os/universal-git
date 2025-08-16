import fs from 'node:fs/promises';
import path from 'path';
//import { defineConfig } from 'rollup';
import pkg from './package.json' with { type: 'json' };
import url from 'node:url';
const externals = [
  'fs',
  'path',
  'crypto',
  'stream',
  'crc/lib/crc32.js',
  'async-lock',
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
    'index': 'isomorphic-git/src/index.js', 
    'FileSystem: 'isomorphic-git/src/models/FileSystem',
    'internal-apis': 'isomorphic-git/src/internal-apis.js',
    'managers': 'isomorphic-git/src/managers/index.js', 
    'models': 'isomorphic-git/src/models/index.js', 
    'http-node': 'isomorphic-git/src/http/web/index.js',
    'http-web': 'isomorphic-git/src/http/web/index.js',
  },
  external(id) {
    // All modules that do not come from us are external by definition.
    const external =  externals.includes(id) || id.includes('node_modules') && !id.includes('isomorphic-git')
    const resolution = import.meta.resolve(id);
    console.log({external, resolution, id})
    return external;
  }, //[...external],
  plugins: [
    // TODO: rollup does not work well with urls?
    {
      "name": "node-resolve",
      "description": "uses node module resolve to link types correct and add extensions as needed and so on.",
      async resolveId(source,importer,options) {
            // || import.meta.resolve(source,importer);
        console.log({ resolution: import.meta.resolve(source,importer) });
        // This should resolve existing files with extension as also extension less imports via the package.json mappings.		
        const resolution = await this.resolve(source, importer, options) //|| { external: true }
         || import.meta.resolve(source,importer);
        // console.log({ resolution})
        // If it cannot be resolved or is external, just return it
        // so that Rollup can display an error
        if (resolution.external || resolution.id) return resolution;
        console.log({ resolution, source, importer })
        const filePath = url.fileURLToPath(resolution);
        console.log({ filePath })
        const exists = await fs.stat(filePath);
        console.log({ source, resolution })
        return filePath;
      }
    }
  ],
  output: [
    {
      format: 'es',
      dir: import.meta.dirname,
      chunkFileNames: "internal/[name].js",
      minifyInternalExports: false
    },
  ],
}
