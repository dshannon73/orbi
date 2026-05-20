import { Router } from 'express';
import { getConnection } from '../sf';

const router = Router();

// GET /meta/picklist/:object/:field — returns active picklist values for a field
router.get('/picklist/:object/:field', async (req, res) => {
  try {
    const conn = getConnection();
    const desc = await conn.sobject(req.params.object).describe();
    const field = (desc.fields as any[]).find(
      (f: any) => f.name.toLowerCase() === req.params.field.toLowerCase()
    );
    if (!field) return res.status(404).json({ error: 'Field not found' });
    const values = (field.picklistValues ?? [])
      .filter((v: any) => v.active)
      .map((v: any) => v.value);
    res.json({ values });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
