import * as path from 'path';
import { fileURLToPath } from 'url';
import { Project, ModuleKind, ScriptTarget } from 'ts-morph';
import { normalizePath } from './dependencies/pathUtils.ts';

// CONFIGURATION
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const CONFIG = {
    PROJECT_ROOT: path.resolve(__dirname, '..'),
    SRC_DIR: path.resolve(path.resolve(__dirname, '..'), 'tmp'),
    OUT_DIR: path.resolve(path.resolve(__dirname, '..'), 'out'),
    ENTRY_POINT_FILES: ['index.js', 'internal-apis.js', 'managers/index.js'],
    BUNDLE_JS_PATH: path.join(path.resolve(path.resolve(__dirname, '..'), 'out'), 'bundle.js'),
    BUNDLE_DTS_PATH: path.join(path.resolve(path.resolve(__dirname, '..'), 'out'), 'bundle.d.ts'),
};

export const projectRoot = CONFIG.PROJECT_ROOT;
export const project = new Project({
    //    tsConfigFilePath: 'tsconfig.json',
    compilerOptions: { allowJs: true, checkJs: true, target: ScriptTarget.ESNext, module: ModuleKind.ESNext },
});
project.addSourceFilesAtPaths(path.join(CONFIG.SRC_DIR, '**/*.js'));
// 3. Define your entry points (using absolute paths)




export const entryPoints = [
    path.resolve(CONFIG.SRC_DIR, 'index.js'),
    path.resolve(CONFIG.SRC_DIR, 'internal-apis.js'),
    path.resolve(CONFIG.SRC_DIR, 'managers/index.js'),
    path.resolve(CONFIG.SRC_DIR, 'models/index.js'),
].map(normalizePath);
