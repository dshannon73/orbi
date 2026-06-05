"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sf_1 = require("../sf");
const filters_1 = require("../lib/filters");
const router = (0, express_1.Router)();
const FIELDS = `Id, Name, Type, Industry, AnnualRevenue, NumberOfEmployees, OwnerId, Owner.Name,
  Owner.UserRole.Name, BillingCity, BillingState, BillingCountry, Description, LastActivityDate`;
router.get('/', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const { search, ownerId, limit = 50, offset = 0, ownerRolePattern, ownerName, justMyData, currentUserId } = req.query;
        const clauses = ['IsDeleted = false'];
        if (search)
            clauses.push(`Name LIKE '%${search.replace(/'/g, "''")}%'`);
        if (ownerId)
            clauses.push(`OwnerId = '${ownerId}'`);
        (0, filters_1.ownershipClauses)({ ownerRolePattern, ownerName, justMyData, currentUserId }).forEach(c => clauses.push(c));
        const result = await conn.query(`SELECT ${FIELDS} FROM Account WHERE ${clauses.join(' AND ')} ORDER BY LastModifiedDate DESC LIMIT ${limit} OFFSET ${offset}`);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const [account, opps, activities] = await Promise.all([
            conn.query(`SELECT ${FIELDS} FROM Account WHERE Id = '${req.params.id}'`),
            conn.query(`SELECT Id, Name, StageName, Amount, CloseDate, OwnerId, Owner.Name FROM Opportunity WHERE AccountId = '${req.params.id}' ORDER BY CloseDate DESC LIMIT 10`),
            conn.query(`SELECT Id, Subject, Status, ActivityDate FROM Task WHERE AccountId = '${req.params.id}' ORDER BY ActivityDate DESC LIMIT 10`),
        ]);
        res.json({ account: account.records[0], opportunities: opps.records, activities: activities.records });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.patch('/:id', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const result = await conn.sobject('Account').update({ Id: req.params.id, ...req.body });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
