const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils/http');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Missing or malformed Authorization header'));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role, name }
    next();
  } catch (err) {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

function requireRole(...roles) {
  return function roleCheck(req, res, next) {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
