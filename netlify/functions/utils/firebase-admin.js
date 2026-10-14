/* Shared Firebase Admin init — reused across all function invocations
   (Lambda keeps the module cache warm between calls). */
const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Netlify env vars are single-line, so the private key's newlines are
    // stored escaped as \n and must be restored before use.
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase service account env vars (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
  }
  return admin.firestore();
}

module.exports = { getDb };
