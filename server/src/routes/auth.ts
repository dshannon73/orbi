import { Router } from 'express';
import { getConnection, resetConnection } from '../sf';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userName?: string;
    userEmail?: string;
  }
}

const router = Router();

// POST /login — authenticates using the SF CLI token for the org62 alias
router.post('/login', async (req, res) => {
  try {
    const conn = resetConnection(); // always grab a fresh CLI token on login
    const identity = await conn.identity() as any;

    req.session.userId = identity.user_id;
    req.session.userName = identity.display_name || identity.username;
    req.session.userEmail = identity.email || identity.username;

    let photoUrl: string | undefined;
    try {
      const photoResult = await (conn as any).request(`/connect/user-profiles/${identity.user_id}/photo`);
      photoUrl = photoResult?.fullEmailPhotoUrl || photoResult?.photoUrl || undefined;
    } catch { /* skip */ }

    return res.json({
      ok: true,
      user: {
        userId: identity.user_id,
        userName: identity.display_name || identity.username,
        userEmail: identity.email || identity.username,
        photoUrl,
      },
    });
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Authentication failed' });
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /me
router.get('/me', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const conn = getConnection();
    const result = await conn.query(
      `SELECT Id, Name, Email, Title, Department, UserRole.Name, Profile.Name, LastLoginDate FROM User WHERE Id = '${userId}'`
    );
    const sfUser = result.records[0];
    return res.json({ user: sfUser });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
