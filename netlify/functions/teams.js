/* CRUD for the "teams" collection.
   GET            -> list all teams
   POST   {id,..} -> upsert one team (admin token required)
   DELETE ?id=... -> delete one team (admin token required) */
const { getDb } = require('./utils/firebase-admin');
const { requireAdmin } = require('./utils/auth');

const COLLECTION = 'teams';
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const db = getDb();

  if (event.httpMethod === 'GET') {
    const snap = await db.collection(COLLECTION).get();
    return json(200, snap.docs.map(d => d.data()));
  }

  if (event.httpMethod === 'POST') {
    const auth = requireAdmin(event);
    if (!auth.ok) return json(auth.status, auth.body);

    let doc;
    try { doc = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'طلب غير صالح' }); }
    if (!doc.id) return json(400, { error: 'مطلوب id' });

    await db.doc(`${COLLECTION}/${doc.id}`).set(doc);
    return json(200, doc);
  }

  if (event.httpMethod === 'DELETE') {
    const auth = requireAdmin(event);
    if (!auth.ok) return json(auth.status, auth.body);

    const id = (event.queryStringParameters || {}).id;
    if (!id) return json(400, { error: 'مطلوب id' });

    await db.doc(`${COLLECTION}/${id}`).delete();
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
};
