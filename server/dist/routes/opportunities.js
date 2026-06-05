"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sf_1 = require("../sf");
const filters_1 = require("../lib/filters");
const router = (0, express_1.Router)();
const FIELDS = `Id, Name, StageName, Amount, CloseDate, Probability, Type, LeadSource,
  ForecastCategoryName, Segment__c,
  AccountId, Account.Name, OwnerId, Owner.Name, Owner.UserRole.Name, Description, IsClosed, IsWon,
  NextStep, LastActivityDate, CreatedDate`;
router.get('/', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { ownerId, stage, closed, search, category, forecastCategory, closeDateFrom, closeDateTo, amountMin, amountMax, limit = 50, offset = 0, ownerRolePattern, ownerName, justMyData, currentUserId, } = req.query;
        const clauses = ['IsDeleted = false'];
        if (ownerId)
            clauses.push(`OwnerId = '${ownerId}'`);
        // Stage: picklist multi-select (comma-separated exact values, optional ! prefix for NOT IN)
        if (stage) {
            const c = (0, filters_1.picklistToSoqlClause)(stage, 'StageName');
            if (c)
                clauses.push(c);
        }
        // Category (Type field): picklist multi-select
        if (category) {
            const c = (0, filters_1.picklistToSoqlClause)(category, 'Type');
            if (c)
                clauses.push(c);
        }
        // Forecast Category
        if (forecastCategory) {
            const c = (0, filters_1.picklistToSoqlClause)(forecastCategory, 'ForecastCategoryName');
            if (c)
                clauses.push(c);
        }
        // Close date range
        if (closeDateFrom)
            clauses.push(`CloseDate >= ${closeDateFrom}`);
        if (closeDateTo)
            clauses.push(`CloseDate <= ${closeDateTo}`);
        if (amountMin)
            clauses.push(`Amount >= ${parseFloat(amountMin)}`);
        if (amountMax)
            clauses.push(`Amount <= ${parseFloat(amountMax)}`);
        if (closed === 'true')
            clauses.push('IsClosed = true');
        if (closed === 'false')
            clauses.push('IsClosed = false');
        if (search)
            clauses.push(`Name LIKE '%${search.replace(/'/g, "''")}%'`);
        (0, filters_1.ownershipClauses)({ ownerRolePattern, ownerName, justMyData, currentUserId }).forEach(c => clauses.push(c));
        const result = await conn.query(`SELECT ${FIELDS} FROM Opportunity WHERE ${clauses.join(' AND ')} ORDER BY CloseDate DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`);
        if (currentUserId) {
            const dcResult = await conn.query(`SELECT Opportunity__c, Split_Percentage__c FROM Deal_Contribution__c WHERE SE_Name__c = '${currentUserId}'`);
            const dcMap = new Map();
            dcResult.records.forEach((r) => {
                dcMap.set(r.Opportunity__c, (dcMap.get(r.Opportunity__c) ?? 0) + (r.Split_Percentage__c ?? 0));
            });
            result.records.forEach((rec) => {
                const pct = dcMap.get(rec.Id);
                rec._hasDC = pct != null;
                rec._dcPct = pct ?? null;
            });
        }
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const [opp, contribs, tasks] = await Promise.all([
            conn.query(`SELECT ${FIELDS} FROM Opportunity WHERE Id = '${req.params.id}'`),
            conn.query(`SELECT Id, SE_Full_Name__c, Opportunity_Role__c, Split_Percentage__c, Split_Amount__c, SE_Region__c FROM Deal_Contribution__c WHERE Opportunity__c = '${req.params.id}'`),
            conn.query(`SELECT Id, Subject, Status, Priority, ActivityDate, Owner.Name FROM Task WHERE WhatId = '${req.params.id}' ORDER BY ActivityDate DESC LIMIT 10`),
        ]);
        res.json({ opportunity: opp.records[0], contributions: contribs.records, activities: tasks.records });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const result = await conn.sobject('Opportunity').create(req.body);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.patch('/:id', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const result = await conn.sobject('Opportunity').update({ Id: req.params.id, ...req.body });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
