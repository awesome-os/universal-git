import fs from 'fs';
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
  input: `src/${input}`,
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
const pkgify = (input, output, _name) => {
  fs.mkdirSync(path.join(import.meta.dirname, output), { recursive: true })
  fs.writeFileSync(
    path.join(import.meta.dirname, output, 'package.json'),
    JSON.stringify(
      {
        type: 'module',
        main: 'index.js'
      },
      null,
      2
    )
  )
  return [
    ecmaConfig(`${input}/index.js`, `${output}/index.js`),
  ]
}

export default [
  ecmaConfig('index.js', 'index.js'),
  ecmaConfig('internal-apis.js', 'internal-apis.js'),
  ecmaConfig('managers/index.js', 'managers/index.js'),
  ecmaConfig('models/index.js', 'models/index.js'),
  ...pkgify('http/node', 'http/node'),
  ...pkgify('http/web', 'http/web', 'GitHttp'),
]
