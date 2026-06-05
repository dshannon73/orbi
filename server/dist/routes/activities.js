"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sf_1 = require("../sf");
const filters_1 = require("../lib/filters");
const router = (0, express_1.Router)();
// Relationship fields (Owner.Name, What.Name, RecordType.Name) omitted from list queries —
// they trigger "exceeded 100000 distinct who/what's" on large orgs without a tight owner filter.
// OwnerId/WhatId are kept; names are resolved in detail view.
const TASK_FIELDS = `Id, Subject, Status, Priority, SE_Task_Type__c, ActivityDate, OwnerId, WhatId, AccountId`;
const EVENT_FIELDS = `Id, Subject, StartDateTime, EndDateTime, OwnerId, WhatId, AccountId, Location,
  SE_Task_Type__c, Meeting_Type__c, EBU_SE_Task_Type__c, Remote__c, RecordTypeId`;
// Detail queries include What.Name (scoped to a single Id so no large-org limit)
const TASK_DETAIL = `Id, Subject, Status, Priority, SE_Task_Type__c, ActivityDate,
  OwnerId, Owner.Name, WhatId, What.Name, Description, AccountId`;
const EVENT_DETAIL = `Id, Subject, StartDateTime, EndDateTime, OwnerId, Owner.Name,
  WhatId, What.Name, Location, Description, AccountId,
  SE_Task_Type__c, Meeting_Type__c, EBU_SE_Task_Type__c, Remote__c, RecordTypeId,
  RecordType.Name`;
router.get('/', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { ownerId, type, status, priority, taskType, meetingType, recordTypeId, subject, relatedTo, dateFrom, dateTo, limit = 50, offset = 0, ownerRolePattern, ownerName, justMyData, currentUserId, } = req.query;
        // Activities can't use Owner.Name / Owner.UserRole.Name in WHERE without hitting the 100k limit.
        // Use OwnerId = / OwnerId IN (subquery) instead.
        let ownerFilter = '';
        if (ownerId) {
            ownerFilter = ` AND OwnerId = '${ownerId}'`;
        }
        else if (justMyData === 'true' && currentUserId) {
            ownerFilter = ` AND OwnerId = '${currentUserId}'`;
        }
        else if (ownerName && ownerName.trim()) {
            const nameClause = (0, filters_1.patternToSoqlClause)(ownerName.trim(), 'Name');
            if (nameClause)
                ownerFilter = ` AND OwnerId IN (SELECT Id FROM User WHERE ${nameClause})`;
        }
        else if (ownerRolePattern && ownerRolePattern.trim()) {
            const roleClause = (0, filters_1.patternToSoqlClause)(ownerRolePattern.trim(), 'UserRole.Name');
            if (roleClause)
                ownerFilter = ` AND OwnerId IN (SELECT Id FROM User WHERE ${roleClause})`;
        }
        // picklist filters
        const statusClause = status ? ' AND ' + (0, filters_1.picklistToSoqlClause)(status, 'Status') : '';
        const priorityClause = priority ? ' AND ' + (0, filters_1.picklistToSoqlClause)(priority, 'Priority') : '';
        const taskTypeClause = taskType ? ' AND ' + (0, filters_1.picklistToSoqlClause)(taskType, 'SE_Task_Type__c') : '';
        const meetingTypeClause = meetingType ? ' AND ' + (0, filters_1.picklistToSoqlClause)(meetingType, 'Meeting_Type__c') : '';
        const rtClause = recordTypeId ? ` AND RecordTypeId = '${recordTypeId.replace(/'/g, "''")}'` : '';
        // text/glob filters — only apply if What.Name is queried (adds overhead, skip unless provided)
        const subjectClause = subject ? ' AND ' + (0, filters_1.patternToSoqlClause)(subject, 'Subject') : '';
        // Always apply a default date window when the user hasn't specified one.
        // Without owner filter, this is also required to avoid "exceeded 100000 distinct who/what's".
        // With owner filter, it keeps results relevant (not all-time) while still showing past records.
        const effectiveDateFrom = dateFrom || 'LAST_N_DAYS:90';
        const effectiveDateTo = dateTo || 'NEXT_N_DAYS:90';
        function soqlDate(d, suffix) {
            return d.includes('_N_DAYS') ? ` AND ${suffix} >= ${d}` : ` AND ${suffix} >= ${d}T00:00:00Z`;
        }
        function soqlDateTo(d, suffix) {
            return d.includes('_N_DAYS') ? ` AND ${suffix} <= ${d}` : ` AND ${suffix} <= ${d}T23:59:59Z`;
        }
        const taskDateFrom = soqlDate(effectiveDateFrom, 'ActivityDate');
        const taskDateTo = soqlDateTo(effectiveDateTo, 'ActivityDate');
        const evtDateFrom = soqlDate(effectiveDateFrom, 'StartDateTime');
        const evtDateTo = soqlDateTo(effectiveDateTo, 'StartDateTime');
        // Simple base — date range handles scoping
        const taskBase = 'ActivityDate != null';
        const eventBase = 'StartDateTime != null';
        const taskWhere = `${taskBase}${ownerFilter}${statusClause}${priorityClause}${taskTypeClause}${subjectClause}${taskDateFrom}${taskDateTo}`;
        const eventWhere = `${eventBase}${ownerFilter}${taskTypeClause}${meetingTypeClause}${rtClause}${subjectClause}${evtDateFrom}${evtDateTo}`;
        if (type === 'Task') {
            const tasks = await conn.query(`SELECT ${TASK_FIELDS} FROM Task WHERE ${taskWhere} ORDER BY ActivityDate ASC NULLS LAST LIMIT ${limit} OFFSET ${offset}`);
            return res.json(tasks);
        }
        if (type === 'Event') {
            const events = await conn.query(`SELECT ${EVENT_FIELDS} FROM Event WHERE ${eventWhere} ORDER BY StartDateTime ASC LIMIT ${limit} OFFSET ${offset}`);
            return res.json(events);
        }
        const [tasks, events] = await Promise.all([
            conn.query(`SELECT ${TASK_FIELDS} FROM Task WHERE ${taskWhere} ORDER BY ActivityDate ASC NULLS LAST LIMIT ${limit}`),
            conn.query(`SELECT ${EVENT_FIELDS} FROM Event WHERE ${eventWhere} ORDER BY StartDateTime ASC LIMIT ${limit}`),
        ]);
        res.json({ tasks: tasks.records, events: events.records });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET /meta/event-record-types — for the record type filter dropdown
// GET /activities/search-related — searches Opportunities and Accounts for WhatId dropdown
// Params: q (unified search term), currentUserId (for DC/activity ranking), ownerName, ownerRole
router.get('/search-related', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { q = '', oppName = '', accountName = '', ownerName = '', ownerRole = '', currentUserId = '' } = req.query;
        // Support both legacy params and unified q
        const term = q || oppName || accountName;
        if (term.length < 2 && ownerName.length < 2 && ownerRole.length < 2)
            return res.json({ results: [] });
        const esc = (s) => s.replace(/'/g, "''");
        const safeTerm = esc(term);
        const oppClauses = ['IsDeleted = false', 'IsClosed = false', `ForecastCategoryName != 'Omitted'`];
        if (term.length >= 2)
            oppClauses.push(`(Name LIKE '%${safeTerm}%' OR Account.Name LIKE '%${safeTerm}%')`);
        if (ownerName.length >= 2)
            oppClauses.push(`Owner.Name LIKE '%${esc(ownerName)}%'`);
        if (ownerRole.length >= 2)
            oppClauses.push(`Owner.UserRole.Name LIKE '%${esc(ownerRole)}%'`);
        const acctClauses = ['IsDeleted = false', `Name LIKE '%${safeTerm}%'`];
        const [oppsRes, acctRes] = await Promise.all([
            conn.query(`SELECT Id, Name, ForecastCategoryName, Amount, StageName, CloseDate, LastModifiedDate, LastActivityDate,
                OwnerId, Owner.Name, Owner.UserRole.Name, AccountId, Account.Name
         FROM Opportunity WHERE ${oppClauses.join(' AND ')}
         ORDER BY LastModifiedDate DESC NULLS LAST LIMIT 25`),
            term.length >= 2 ? conn.query(`SELECT Id, Name, LastModifiedDate, Owner.Name, Owner.UserRole.Name FROM Account WHERE ${acctClauses.join(' AND ')}
         ORDER BY LastModifiedDate DESC NULLS LAST LIMIT 10`) : Promise.resolve({ records: [] }),
        ]);
        // Fetch my DCs and recent activities on these opps for ranking
        const oppIds = oppsRes.records.map((r) => r.Id);
        let myDCOppIds = new Set();
        let activityCountByOpp = new Map();
        if (oppIds.length > 0 && currentUserId) {
            const idList = oppIds.map((id) => `'${id}'`).join(',');
            const [dcRes, actRes] = await Promise.all([
                conn.query(`SELECT Opportunity__c FROM Deal_Contribution__c WHERE SE_Name__c = '${esc(currentUserId)}' AND Opportunity__c IN (${idList}) LIMIT 50`),
                conn.query(`SELECT WhatId, COUNT(Id) cnt FROM Event WHERE OwnerId = '${esc(currentUserId)}' AND WhatId IN (${idList}) GROUP BY WhatId LIMIT 50`),
            ]).catch(() => [{ records: [] }, { records: [] }]);
            dcRes.records.forEach((d) => myDCOppIds.add(d.Opportunity__c));
            actRes.records.forEach((a) => activityCountByOpp.set(a.WhatId, Number(a.cnt ?? 0)));
        }
        const FC_RANK = { Commit: 4, 'Best Case': 3, Pipeline: 2, Omitted: 0 };
        const rankedOpps = oppsRes.records.map((r) => {
            let score = 0;
            const fc = FC_RANK[r.ForecastCategoryName] ?? 1;
            score += fc * 15;
            score += Math.min((r.Amount ?? 0) / 500_000, 1) * 20;
            const daysSinceModified = r.LastModifiedDate
                ? (Date.now() - new Date(r.LastModifiedDate).getTime()) / 86400000 : 999;
            if (daysSinceModified <= 14)
                score += 15;
            else if (daysSinceModified <= 30)
                score += 10;
            else if (daysSinceModified <= 60)
                score += 5;
            if (myDCOppIds.has(r.Id))
                score += 25;
            score += Math.min((activityCountByOpp.get(r.Id) ?? 0) * 5, 20);
            const daysToClose = r.CloseDate
                ? (new Date(r.CloseDate).getTime() - Date.now()) / 86400000 : 999;
            if (daysToClose >= 0 && daysToClose <= 30)
                score += 10;
            return {
                type: 'Opportunity', id: r.Id, name: r.Name,
                forecastCategory: r.ForecastCategoryName, amount: r.Amount, stage: r.StageName,
                closeDate: r.CloseDate, ownerName: r.Owner?.Name, ownerRole: r.Owner?.UserRole?.Name,
                accountName: r['Account']?.Name,
                hasMyDC: myDCOppIds.has(r.Id),
                activityCount: activityCountByOpp.get(r.Id) ?? 0,
                _score: score,
            };
        }).sort((a, b) => b._score - a._score);
        const accounts = acctRes.records.map((r) => ({
            type: 'Account', id: r.Id, name: r.Name,
            ownerName: r.Owner?.Name, ownerRole: r.Owner?.UserRole?.Name,
            _score: 0,
        }));
        res.json({ results: [...rankedOpps, ...accounts] });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /activities/log-event — create SF Event from a Google Calendar event
router.post('/log-event', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { subject, startDateTime, endDateTime, description, whatId, ownerId, recordTypeId, seTaskType } = req.body;
        const result = await conn.sobject('Event').create({
            Subject: subject,
            StartDateTime: startDateTime,
            EndDateTime: endDateTime,
            Description: description || undefined,
            WhatId: whatId || undefined,
            OwnerId: ownerId,
            RecordTypeId: recordTypeId,
            SE_Task_Type__c: seTaskType,
        });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/record-types', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const result = await conn.query(`SELECT Id, Name FROM RecordType WHERE SobjectType = 'Event' AND IsActive = true ORDER BY Name ASC`);
        res.json({ values: result.records });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const [task, event] = await Promise.all([
            conn.query(`SELECT ${TASK_DETAIL} FROM Task WHERE Id = '${req.params.id}'`).catch(() => ({ records: [], done: true, totalSize: 0 })),
            conn.query(`SELECT ${EVENT_DETAIL} FROM Event WHERE Id = '${req.params.id}'`).catch(() => ({ records: [], done: true, totalSize: 0 })),
        ]);
        const record = task.records[0] || event.records[0];
        if (!record)
            return res.status(404).json({ error: 'Not found' });
        res.json(record);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { type, ...fields } = req.body;
        const result = await conn.sobject(type === 'Event' ? 'Event' : 'Task').create(fields);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.patch('/:id', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { type, ...fields } = req.body;
        const result = await conn.sobject(type === 'Event' ? 'Event' : 'Task').update({ Id: req.params.id, ...fields });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
