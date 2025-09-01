// Top level file is just a mixin of submodules & constants
// 'use strict';

export { Deflate, deflate, deflateRaw, gzip } from './lib/deflate.js';

export { Inflate, inflate, inflateRaw, ungzip } from './lib/inflate.js';

export * as constants  from './lib/zlib/constants.js';

// module.exports.Deflate = Deflate;
// module.exports.deflate = deflate;
// module.exports.deflateRaw = deflateRaw;
// module.exports.gzip = gzip;
// module.exports.Inflate = Inflate;
// module.exports.inflate = inflate;
// module.exports.inflateRaw = inflateRaw;
// module.exports.ungzip = ungzip;
// module.exports.constants = constants;
