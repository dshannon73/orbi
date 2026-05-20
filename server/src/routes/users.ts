import { Router } from 'express';
import { getConnection } from '../sf';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const conn = getConnection();
    const { search, rolePattern, limit = 200 } = req.query;
    let where = "WHERE IsActive = true";
    if (search) {
      const terms = String(search).split(',').map(t => t.trim()).filter(Boolean);
      const conditions = terms.map(t => {
        const safe = t.replace(/'/g, "''");
        return `(Name LIKE '%${safe}%' OR Email LIKE '%${safe}%')`;
      }).join(' OR ');
      if (conditions) where += ` AND (${conditions})`;
    }
    if (rolePattern) {
      const terms = String(rolePattern).split(',').map(t => {
        let s = t.trim();
        // strip surrounding quotes (single or double) that may come from the filter input
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          s = s.slice(1, -1).trim();
        }
        return s;
      }).filter(Boolean);
      const conditions = terms.map(t => {
        const safe = t.replace(/'/g, "''").replace(/\*/g, '%');
        const likeVal = safe.includes('%') ? safe : `%${safe}%`;
        return `UserRole.Name LIKE '${likeVal}'`;
      }).join(' OR ');
      if (conditions) where += ` AND (${conditions})`;
    }

    const result = await conn.query(
      `SELECT Id, Name, Email, Title, Department, UserRole.Name, Profile.Name, LastLoginDate, IsActive FROM User ${where} ORDER BY Name ASC LIMIT ${limit}`
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const conn = getConnection();
    const identity = await conn.identity();
    res.json(identity);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const conn = getConnection();
    const user = await conn.sobject('User').retrieve(req.params.id);
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
