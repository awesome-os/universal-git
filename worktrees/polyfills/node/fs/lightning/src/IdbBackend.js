import require$$0 from '../_virtual/idb-keyval.js';

var IdbBackend_1;
var hasRequiredIdbBackend;

function requireIdbBackend () {
	if (hasRequiredIdbBackend) return IdbBackend_1;
	hasRequiredIdbBackend = 1;
	const idb = require$$0;

	IdbBackend_1 = class IdbBackend {
	  constructor(dbname, storename) {
	    this._database = dbname;
	    this._storename = storename;
	    this._store = new idb.Store(this._database, this._storename);
	  }
	  saveSuperblock(superblock) {
	    return idb.set("!root", superblock, this._store);
	  }
	  loadSuperblock() {
	    return idb.get("!root", this._store);
	  }
	  readFile(inode) {
	    return idb.get(inode, this._store)
	  }
	  writeFile(inode, data) {
	    return idb.set(inode, data, this._store)
	  }
	  unlink(inode) {
	    return idb.del(inode, this._store)
	  }
	  wipe() {
	    return idb.clear(this._store)
	  }
	  close() {
	    return idb.close(this._store)
	  }
	};
	return IdbBackend_1;
}

export { requireIdbBackend as __require };
