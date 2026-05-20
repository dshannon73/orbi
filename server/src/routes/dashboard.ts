import { Router } from 'express';
import { getConnection } from '../sf';
import { ownershipClauses } from '../lib/filters';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const conn = getConnection();
    const {
      currentUserId,
      ownerRolePattern,
      ownerName,
      justMyData,
      dateFrom,
      dateTo,
      limit = '10',
    } = req.query as Record<string, string>;

    const limitNum = parseInt(limit, 10) || 10;

    // ── 1. My open DCs ────────────────────────────────────────────────────────
    const dcClauses = [`Opportunity_Closed__c != 'true'`];
    if (currentUserId) dcClauses.push(`SE_Name__c = '${currentUserId}'`);

    const dcResult = await conn.query(
      `SELECT Opportunity__c, Split_Percentage__c, Split_Amount__c, Opportunity_Amount__c ` +
      `FROM Deal_Contribution__c WHERE ${dcClauses.join(' AND ')} LIMIT 200`
    );

    const dcMap = new Map<string, any>();
    for (const r of dcResult.records as any[]) {
      // If multiple DCs exist for the same opp, last one wins for display;
      // amounts are summed in stats separately.
      dcMap.set(r.Opportunity__c, r);
    }
    const allDcOppIds = Array.from(dcMap.keys());

    // ── 2. Matching opportunities ─────────────────────────────────────────────
    let matchedOpps: any[] = [];

    if (allDcOppIds.length > 0) {
      const oppIdList = allDcOppIds.map(id => `'${id}'`).join(', ');
      // No ownership filter on opps — the SE doesn't own them (AE does).
      // Scope is already established via SE_Name__c on the DC query above.
      const oppResult = await conn.query(
        `SELECT Id, Name, StageName, ForecastCategoryName, CloseDate, Amount, ` +
        `AccountId, Account.Name, OwnerId, Owner.Name, Owner.UserRole.Name ` +
        `FROM Opportunity WHERE Id IN (${oppIdList}) ` +
        `ORDER BY CloseDate ASC NULLS LAST LIMIT 200`
      );
      matchedOpps = oppResult.records as any[];
    }

    const matchedOppIds = matchedOpps.map((o: any) => o.Id);

    // ── 3. Activity counts ────────────────────────────────────────────────────
    const actCountMap = new Map<string, number>();

    if (matchedOppIds.length > 0) {
      const idList = matchedOppIds.map(id => `'${id}'`).join(', ');

      const eventClauses = [`WhatId IN (${idList})`];
      if (dateFrom) eventClauses.push(`StartDateTime >= ${dateFrom}T00:00:00Z`);
      if (dateTo) eventClauses.push(`StartDateTime <= ${dateTo}T23:59:59Z`);

      const taskClauses = [`WhatId IN (${idList})`];
      if (dateFrom) taskClauses.push(`ActivityDate >= ${dateFrom}`);
      if (dateTo) taskClauses.push(`ActivityDate <= ${dateTo}`);

      const [eventResult, taskResult] = await Promise.all([
        conn.query(
          `SELECT WhatId, COUNT(Id) cnt FROM Event ` +
          `WHERE ${eventClauses.join(' AND ')} GROUP BY WhatId LIMIT 200`
        ),
        conn.query(
          `SELECT WhatId, COUNT(Id) cnt FROM Task ` +
          `WHERE ${taskClauses.join(' AND ')} GROUP BY WhatId LIMIT 200`
        ),
      ]);

      for (const r of [...(eventResult.records as any[]), ...(taskResult.records as any[])]) {
        actCountMap.set(r.WhatId, (actCountMap.get(r.WhatId) ?? 0) + (r.cnt ?? 0));
      }
    }

    // ── 4. Travel approvals + customer hours ─────────────────────────────────
    const travelClauses = ['IsDeleted = false'];
    if (dateFrom) travelClauses.push(`Travel_Start_Date__c >= ${dateFrom}`);
    if (dateTo) travelClauses.push(`Travel_Start_Date__c <= ${dateTo}`);
    ownershipClauses({ ownerRolePattern, ownerName, justMyData, currentUserId }).forEach(c => travelClauses.push(c));

    // Customer-related hours: Events owned by the user, in the date range,
    // logged against an account or opp (WhatId != null).
    // Use OwnerId subquery for name/role filters — avoids the 100k who/what limit.
    const custHoursClauses = ['WhatId != null'];
    if (currentUserId && (justMyData === 'true' || (!ownerName && !ownerRolePattern))) {
      custHoursClauses.push(`OwnerId = '${currentUserId}'`);
    } else if (ownerName && ownerName.trim()) {
      custHoursClauses.push(`OwnerId IN (SELECT Id FROM User WHERE Name LIKE '%${ownerName.trim().replace(/'/g, "''")}%')`);
    } else if (ownerRolePattern && ownerRolePattern.trim()) {
      custHoursClauses.push(`OwnerId IN (SELECT Id FROM User WHERE UserRole.Name LIKE '%${ownerRolePattern.trim().replace(/'/g, "''")}%')`);
    } else if (currentUserId) {
      custHoursClauses.push(`OwnerId = '${currentUserId}'`);
    }
    if (dateFrom) custHoursClauses.push(`StartDateTime >= ${dateFrom}T00:00:00Z`);
    if (dateTo)   custHoursClauses.push(`StartDateTime <= ${dateTo}T23:59:59Z`);

    const [travelResult, custHoursResult] = await Promise.all([
      conn.query(
        `SELECT Id, Name, Approval_Status__c, Travel_Start_Date__c, Travel_End_Date__c, ` +
        `Total_Cost__c, OwnerId, Owner.Name ` +
        `FROM Travel_Approval__c WHERE ${travelClauses.join(' AND ')} ` +
        `ORDER BY Travel_Start_Date__c DESC NULLS LAST LIMIT ${limitNum}`
      ),
      conn.query(
        `SELECT SUM(DurationInMinutes) totalMins FROM Event WHERE ${custHoursClauses.join(' AND ')}`
      ),
    ]);

    const travelApprovals = travelResult.records as any[];
    const customerHours = Math.round(((custHoursResult.records[0] as any)?.totalMins ?? 0) / 60 * 10) / 10;

    // ── 5. Stats ──────────────────────────────────────────────────────────────
    const matchedOppIdSet = new Set(matchedOppIds);

    let totalSplitAmount = 0;
    let totalOppAmount = 0;
    for (const [oppId, dc] of dcMap.entries()) {
      if (matchedOppIdSet.has(oppId)) {
        totalSplitAmount += dc.Split_Amount__c ?? 0;
        totalOppAmount += dc.Opportunity_Amount__c ?? 0;
      }
    }

    const stats = {
      travelCount: travelResult.totalSize,
      dcCount: matchedOppIds.length,
      totalSplitAmount,
      totalOppAmount,
      customerHours,
    };

    // ── 6. Build accountOpps ──────────────────────────────────────────────────
    const accountMap = new Map<string, { accountId: string; accountName: string; opps: any[] }>();

    for (const opp of matchedOpps) {
      const accountId: string = opp.AccountId;
      const accountName: string = (opp.Account as any)?.Name ?? accountId;
      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, { accountId, accountName, opps: [] });
      }
      const dc = dcMap.get(opp.Id);
      accountMap.get(accountId)!.opps.push({
        oppId: opp.Id,
        oppName: opp.Name,
        stage: opp.StageName,
        forecastCategory: opp.ForecastCategoryName,
        closeDate: opp.CloseDate,
        amount: opp.Amount ?? 0,
        dcSplitPct: dc?.Split_Percentage__c ?? null,
        dcSplitAmount: dc?.Split_Amount__c ?? null,
        activityCount: actCountMap.get(opp.Id) ?? 0,
      });
    }

    // Sort opps within each account by Amount desc
    for (const account of accountMap.values()) {
      account.opps.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    }

    // Sort accounts by max opp amount desc
    const accountOpps = Array.from(accountMap.values()).sort((a, b) => {
      const maxA = a.opps.length > 0 ? a.opps[0].amount : 0;
      const maxB = b.opps.length > 0 ? b.opps[0].amount : 0;
      return (maxB ?? 0) - (maxA ?? 0);
    });

    res.json({ stats, travelApprovals, accountOpps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
