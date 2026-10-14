/* Issues a short-lived signed Supabase Storage upload URL.
   POST { fileName, contentType } -> { uploadUrl, publicUrl }
   The client then PUTs the file bytes directly to uploadUrl. The Supabase
   service_role key stays on the server the whole time.
   Open to the public (used by both the admin panel and the public squad-
   application form, which has no login) — restricted to image files only
   to limit abuse. */
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_BUCKET) {
    return json(500, { error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_BUCKET غير مضبوطة على الخادم' });
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'طلب غير صالح' }); }

  const contentType = String(payload.contentType || '');
  if (!contentType.startsWith('image/')) {
    return json(400, { error: 'يُسمح برفع الصور فقط' });
  }

  const ext = ((payload.fileName || '').split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const signRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(SUPABASE_BUCKET)}/${path}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  );

  if (!signRes.ok) {
    const txt = await signRes.text().catch(() => '');
    return json(502, { error: 'تعذر إنشاء رابط الرفع من Supabase: ' + txt });
  }

  const { url, token } = await signRes.json();
  // Supabase returns `url` relative to the /storage/v1 base (e.g.
  // "/object/upload/sign/<bucket>/<path>?token=..."), NOT relative to the
  // domain root — so /storage/v1 must be re-added here.
  const uploadUrl = url.startsWith('http')
    ? url
    : `${SUPABASE_URL}/storage/v1${url.startsWith('/') ? '' : '/'}${url}`;
  const finalUploadUrl = uploadUrl.includes('token=') ? uploadUrl : `${uploadUrl}${uploadUrl.includes('?') ? '&' : '?'}token=${token}`;
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${path}`;

  return json(200, { uploadUrl: finalUploadUrl, publicUrl });
};
