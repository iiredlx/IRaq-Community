/* Handles admin login only.
   POST { code } -> { token }  (token valid 12h, used as Bearer auth on every
   write/delete call the other functions make). The real code now lives only
   in the Netlify env var ADMIN_CODE — it never ships in the page source. */
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secret = process.env.ADMIN_JWT_SECRET;
  const adminCode = process.env.ADMIN_CODE;
  if (!secret || !adminCode) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ADMIN_CODE / ADMIN_JWT_SECRET غير مضبوطة على الخادم' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'طلب غير صالح' }) };
  }

  const code = String(payload.code || '').trim().toUpperCase();
  if (code !== adminCode) {
    return { statusCode: 401, body: JSON.stringify({ error: 'الرمز غير صحيح' }) };
  }

  const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '12h' });
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  };
};
