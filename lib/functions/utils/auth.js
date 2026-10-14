/* Verifies the short-lived admin token issued by admin-auth.js.
   Nothing in this file is reachable from the browser directly — functions
   call requireAdmin() themselves before doing any write/delete. */
const jwt = require('jsonwebtoken');

function requireAdmin(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, body: { error: 'مطلوب تسجيل الدخول' } };
  }

  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    return { ok: false, status: 500, body: { error: 'ADMIN_JWT_SECRET غير مضبوط على الخادم' } };
  }

  try {
    jwt.verify(token, secret);
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 401, body: { error: 'الجلسة منتهية، سجّل الدخول من جديد' } };
  }
}

module.exports = { requireAdmin };
