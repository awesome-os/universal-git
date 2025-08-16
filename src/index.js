// Do not use them here they are referenced in the managers mostly
// import './typedefs.js';
// import './typedefs-http.js';

import * as api from './api.js';
import * as Errors from './errors/index.js';

// named exports
export * from './api.js';
export { Errors };

const namespaceExports = { Errors, ...api };
export default namespaceExports;
