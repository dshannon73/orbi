import { Router } from 'express';
import { getConnection } from '../sf';
import { ownershipClauses, picklistToSoqlClause } from '../lib/filters';

const router = Router();

const FIELDS = `Id, Name, SE_Name__c, SE_Full_Name__c, Opportunity_Role__c, Split_Percentage__c,
  Opportunity__c, Opportunity__r.Name, Split_Amount__c, Opportunity_Amount__c, SE_Role__c,
  Opportunity_Close_Date__c, Opportunity_Closed__c, SE_Region__c, Split_Won_Amount__c,
  SE_Classification__c, Expert_Count__c, Comments__c, Cap_Override__c, OwnerId, Owner.Name, Owner.UserRole.Name`;

router.get('/', async (req, res) => {
  try {
    const conn = getConnection();
    const { seId, closed, oppName, amountMin, amountMax, forecastCategory, limit = 50, offset = 0, ownerRolePattern, ownerName, justMyData, currentUserId } = req.query as Record<string, string>;
    const clauses: string[] = [];
    if (seId) clauses.push(`SE_Name__c = '${seId}'`);
    if (closed === 'true') clauses.push(`Opportunity_Closed__c = 'true'`);
    if (closed === 'false') clauses.push(`Opportunity_Closed__c != 'true'`);
    if (oppName) clauses.push(`Opportunity__r.Name LIKE '%${oppName.replace(/'/g, "''").replace(/\*/g, '%')}%'`);
    if (amountMin) clauses.push(`Opportunity_Amount__c >= ${parseFloat(amountMin)}`);
    if (amountMax) clauses.push(`Opportunity_Amount__c <= ${parseFloat(amountMax)}`);
    if (forecastCategory) {
      const c = picklistToSoqlClause(forecastCategory, 'Opportunity__r.ForecastCategoryName');
      if (c) clauses.push(c);
    }
    ownershipClauses({ ownerRolePattern, ownerName, justMyData, currentUserId }).forEach(c => clauses.push(c));

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await conn.query(
      `SELECT ${FIELDS} FROM Deal_Contribution__c ${where} ORDER BY Opportunity_Close_Date__c DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
    );

    if (currentUserId) {
      const myDCs = await conn.query(
        `SELECT Opportunity__c, Split_Percentage__c FROM Deal_Contribution__c WHERE SE_Name__c = '${currentUserId}'`
      );
      // Sum all DC records for the same opportunity (a user can have multiple roles)
      const myDCMap = new Map<string, number>();
      (myDCs.records as any[]).forEach((r: any) => {
        const prev = myDCMap.get(r.Opportunity__c) ?? 0;
        myDCMap.set(r.Opportunity__c, prev + (r.Split_Percentage__c ?? 0));
      });
      (result.records as any[]).forEach((rec: any) => {
        const pct = myDCMap.get(rec.Opportunity__c);
        rec._myDC = pct != null ? pct : null;
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const conn = getConnection();
    const result = await conn.query(`SELECT ${FIELDS} FROM Deal_Contribution__c WHERE Id = '${req.params.id}'`);
    res.json(result.records[0] || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /upsert — find existing DC for currentUserId+opportunity, update or create
router.post('/upsert', async (req, res) => {
  try {
    const conn = getConnection();
    const { opportunityId, currentUserId, role, splitPercentage, comments } = req.body;
    if (!opportunityId || !currentUserId) return res.status(400).json({ error: 'opportunityId and currentUserId required' });

    // Find existing record for this SE + opportunity
    const existing = await conn.query(
      `SELECT Id FROM Deal_Contribution__c WHERE SE_Name__c = '${currentUserId}' AND Opportunity__c = '${opportunityId}' LIMIT 1`
    );

    const fields: Record<string, any> = {
      Opportunity_Role__c: role,
      Split_Percentage__c: parseFloat(splitPercentage),
    };
    if (comments !== undefined) fields.Comments__c = comments;

    if (existing.records.length > 0) {
      const id = (existing.records[0] as any).Id;
      await conn.sobject('Deal_Contribution__c').update({ Id: id, ...fields });
      res.json({ action: 'updated', id });
    } else {
      const result = await conn.sobject('Deal_Contribution__c').create({
        SE_Name__c: currentUserId,
        Opportunity__c: opportunityId,
        ...fields,
      }) as any;
      res.json({ action: 'created', id: result.id });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const conn = getConnection();
    const result = await conn.sobject('Deal_Contribution__c').create(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const conn = getConnection();
    const result = await conn.sobject('Deal_Contribution__c').update({ Id: req.params.id, ...req.body });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
