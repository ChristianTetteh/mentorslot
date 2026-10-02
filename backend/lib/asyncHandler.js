// Wraps an async route handler so a thrown error or rejected promise reaches
// Express's error middleware instead of becoming an unhandled rejection.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
