export class BaseError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code] - A machine-readable error code.
   * @param {*} [options.data] - Any extra data relevant to the error.
   * @param {string} [options.caller] - The name of the isomorphic-git function that threw the error.
   * @param {Error} [options.cause] - The original error that caused this new error, following the ES2022 standard.
   */
  constructor(message, { code, data, caller, cause } = {}) {
    // Pass message and the standard `cause` option to the native Error constructor.
    super(message, { cause });

    // Set the name for the custom error, which is a best practice.
    this.name = this.constructor.name;

    // Assign custom properties.
    this.code = code;
    this.data = data;
    this.caller = caller || '';
  }

  /**
   * A simple getter to identify errors originating from this library.
   * @returns {true}
   */
  get isIsomorphicGitError() {
    return true;
  }

  /**
   * Converts the error object to a plain JSON object for serialization.
   * This is crucial for environments like web workers or server-client communication.
   * @returns {object}
   */
  toJSON() {
    const json = {
      name: this.name,
      message: this.message,
      stack: this.stack,
      code: this.code,
      data: this.data,
      caller: this.caller,
    };

    // Recursively serialize the `cause` if it exists.
    if (this.cause) {
      if (this.cause instanceof BaseError) {
        // If the cause is another custom error, use its own `toJSON` method.
        json.cause = this.cause.toJSON();
      } else if (this.cause instanceof Error) {
        // For native errors, serialize its basic properties.
        json.cause = {
          name: this.cause.name,
          message: this.cause.message,
          stack: this.cause.stack,
        };
      } else {
        // Handle non-Error causes.
        json.cause = this.cause;
      }
    }

    return json;
  }
}

class PreflightError extends BaseError {
  constructor(message, options) {
    super(message, options)
    this.name = 'PreflightError'
  }
}
