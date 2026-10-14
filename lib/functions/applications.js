/* Public squad-registration application flow.
   POST (no auth)              -> submit a new application (status: pending)
   GET  (admin token required) -> list all applications
   PUT  (admin token required) -> { id, action: 'approve' | 'reject' }
                                   approve auto-creates the team/coach/players
                                   records (same shape the admin forms use) and
                                   links them together; reject just marks the
                                   application as rejected so it stays visible
                                   under the "مرفوضة" filter. */
const { getDb } = require('./utils/firebase-admin');
const { requireAdmin } = require('./utils/auth');

const COLLECTION = 'applications';
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 6);
}

function cleanCareer(career) {
  return Array.isArray(career)
    ? career
        .map(c => ({ year: String((c && c.year) || '').trim(), team: String((c && c.team) || '').trim() }))
        .filter(c => c.year || c.team)
    : [];
}

function cleanPerson(p, defaults) {
  return {
    name: String((p && p.name) || '').trim(),
    photo: String((p && p.photo) || ''),
    age: String((p && p.age) || ''),
    nationality: String((p && p.nationality) || defaults.nationality),
    flag: String((p && p.flag) || defaults.flag),
    career: cleanCareer(p && p.career)
  };
}

exports.handler = async (event) => {
  const db = getDb();

  /* ---------- public: submit a new application ---------- */
  if (event.httpMethod === 'POST') {
    let doc;
    try { doc = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'طلب غير صالح' }); }

    const teamName = String((doc.team && doc.team.name) || '').trim();
    if (!teamName) return json(400, { error: 'اسم الفريق مطلوب' });

    const rawPlayers = Array.isArray(doc.players) ? doc.players.slice(0, 6) : [];
    if (rawPlayers.length < 4 || rawPlayers.length > 6) return json(400, { error: 'مطلوب 4 لاعبين على الأقل (وحتى 6)' });

    const players = rawPlayers.map(p => ({
      ...cleanPerson(p, { nationality: 'العراق', flag: '🇮🇶' }),
      role: String((p && p.role) || ''),
      gameId: String((p && p.gameId) || '')
    }));
    if (players.some(p => !p.name)) return json(400, { error: 'مطلوب اسم لكل لاعب مُضاف' });

    const captainIndex = Number.isInteger(doc.captainIndex) ? doc.captainIndex : -1;
    if (captainIndex < 0 || captainIndex >= players.length) return json(400, { error: 'مطلوب تحديد قائد الفريق' });

    const contactWhatsapp = String(doc.contactWhatsapp || '').trim();
    if (!contactWhatsapp) return json(400, { error: 'مطلوب رقم واتساب للتواصل' });

    let coach = null;
    if (doc.coach && String(doc.coach.name || '').trim()) {
      coach = {
        ...cleanPerson(doc.coach, { nationality: 'العراق', flag: '🇮🇶' }),
        experience: String(doc.coach.experience || '')
      };
    }

    const application = {
      id: uid('app'),
      status: 'pending',
      submittedAt: new Date().toISOString(),
      contactWhatsapp,
      team: { name: teamName, logo: String((doc.team && doc.team.logo) || '') },
      coach,
      players,
      captainIndex
    };

    await db.doc(`${COLLECTION}/${application.id}`).set(application);
    return json(200, { id: application.id });
  }

  /* ---------- admin: list applications ---------- */
  if (event.httpMethod === 'GET') {
    const auth = requireAdmin(event);
    if (!auth.ok) return json(auth.status, auth.body);

    const snap = await db.collection(COLLECTION).get();
    return json(200, snap.docs.map(d => d.data()));
  }

  /* ---------- admin: approve / reject ---------- */
  if (event.httpMethod === 'PUT') {
    const auth = requireAdmin(event);
    if (!auth.ok) return json(auth.status, auth.body);

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'طلب غير صالح' }); }
    const { id, action } = body;
    if (!id || !['approve', 'reject'].includes(action)) return json(400, { error: 'طلب غير صالح' });

    const ref = db.doc(`${COLLECTION}/${id}`);
    const snap = await ref.get();
    if (!snap.exists) return json(404, { error: 'الطلب غير موجود' });
    const app = snap.data();
    if (app.status !== 'pending') return json(400, { error: 'تمت مراجعة هذا الطلب مسبقاً' });

    if (action === 'reject') {
      await ref.update({ status: 'rejected', reviewedAt: new Date().toISOString() });
      return json(200, { ok: true });
    }

    // approve: create coach (optional), players, then the team — same field
    // shape the admin add/edit forms already write, so they show up on the
    // site exactly like a manually-added record would.
    const today = new Date().toISOString().slice(0, 10);

    let coachId = null;
    if (app.coach) {
      coachId = uid('coach');
      await db.doc(`coaches/${coachId}`).set({
        id: coachId,
        name: app.coach.name,
        photo: app.coach.photo,
        age: app.coach.age,
        nationality: app.coach.nationality,
        flag: app.coach.flag,
        experience: app.coach.experience,
        career: app.coach.career
      });
    }

    const teamId = uid('team');
    const playerIds = [];
    for (const p of app.players) {
      const playerId = uid('plr');
      playerIds.push(playerId);
      await db.doc(`players/${playerId}`).set({
        id: playerId,
        name: p.name,
        photo: p.photo,
        role: p.role,
        gameId: p.gameId,
        age: p.age,
        nationality: p.nationality,
        flag: p.flag,
        currentTeamId: teamId,
        registeredDate: today,
        status: 'active',
        kills: 0,
        tournamentsCount: 0,
        matches: 0,
        bestResult: '',
        bestTournament: '',
        career: p.career
      });
    }

    const captainId = playerIds[app.captainIndex] || null;

    await db.doc(`teams/${teamId}`).set({
      id: teamId,
      name: app.team.name,
      logo: app.team.logo,
      country: 'العراق',
      flag: '🇮🇶',
      game: 'Free Fire',
      registeredDate: today,
      status: 'active',
      captainId,
      coachId,
      playerIds,
      tournamentsCount: 0,
      booyahs: 0,
      totalKills: 0,
      placementPoints: 0,
      totalPoints: 0
    });

    await ref.update({
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      createdTeamId: teamId,
      createdCoachId: coachId,
      createdPlayerIds: playerIds
    });

    return json(200, { ok: true, teamId });
  }

  return json(405, { error: 'Method not allowed' });
};
