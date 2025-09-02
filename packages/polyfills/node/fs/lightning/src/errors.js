var errors;
var hasRequiredErrors;

function requireErrors () {
	if (hasRequiredErrors) return errors;
	hasRequiredErrors = 1;
	function Err(name) {
	  return class extends Error {
	    constructor(...args) {
	      super(...args);
	      this.code = name;
	      if (this.message) {
	        this.message = name + ": " + this.message;
	      } else {
	        this.message = name;
	      }
	    }
	  };
	}

	const EEXIST = Err("EEXIST");
	const ENOENT = Err("ENOENT");
	const ENOTDIR = Err("ENOTDIR");
	const ENOTEMPTY = Err("ENOTEMPTY");
	const ETIMEDOUT = Err("ETIMEDOUT");
	const EISDIR = Err("EISDIR");

	errors = { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY, ETIMEDOUT, EISDIR };
	return errors;
}

export { requireErrors as __require };
