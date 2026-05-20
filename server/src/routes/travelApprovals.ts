import { Router } from 'express';
import { getConnection } from '../sf';
import { ownershipClauses, picklistToSoqlClause } from '../lib/filters';

const router = Router();

const FIELDS = `Id, Name, Approval_Status__c, Description_of_Trip__c, Reason_for_Travel__c,
  Travel_Start_Date__c, Travel_End_Date__c, Total_Cost__c, Hotel__c, Hotel_Cost_Night__c,
  Other__c, Total_Opportunity_Value__c, Travelers_Manager__c, CFO_Approval_Required__c,
  Approval_in_My_Queue__c, Submit_for_Approval_URL__c, Link_to_Travel_Approval_Record__c,
  OwnerId, Owner.Name, Owner.UserRole.Name, CreatedDate, LastModifiedDate`;

router.get('/', async (req, res) => {
  try {
    const conn = getConnection();
    const { status, ownerId, limit = 50, offset = 0, ownerRolePattern, ownerName, justMyData, currentUserId } = req.query as Record<string, string>;
    const clauses = ['IsDeleted = false'];
    if (status) { const c = picklistToSoqlClause(status, 'Approval_Status__c'); if (c) clauses.push(c); }
    if (ownerId) clauses.push(`OwnerId = '${ownerId}'`);
    ownershipClauses({ ownerRolePattern, ownerName, justMyData, currentUserId }).forEach(c => clauses.push(c));

    const result = await conn.query(
      `SELECT ${FIELDS} FROM Travel_Approval__c WHERE ${clauses.join(' AND ')} ORDER BY Travel_Start_Date__c DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const conn = getConnection();
    const result = await conn.query(`SELECT ${FIELDS} FROM Travel_Approval__c WHERE Id = '${req.params.id}'`);
    res.json(result.records[0] || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const conn = getConnection();
    const result = await conn.sobject('Travel_Approval__c').create(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const conn = getConnection();
    const result = await conn.sobject('Travel_Approval__c').update({ Id: req.params.id, ...req.body });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
