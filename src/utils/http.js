// Wraps an async route handler so thrown/rejected errors reach Express's
// error middleware instead of crashing the process.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { asyncHandler, HttpError };
