"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const slack_1 = require("../services/slack");
const sf_1 = require("../sf");
const filters_1 = require("../lib/filters");
const router = (0, express_1.Router)();
router.post('/send', async (req, res) => {
    try {
        const { channel, text } = req.body;
        if (!channel || !text)
            return res.status(400).json({ error: 'channel and text required' });
        const result = await (0, slack_1.postToSlack)(channel, text);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/canvas/activities', async (req, res) => {
    try {
        const { ownerRolePattern, ownerName, justMyData, currentUserId, dateFrom, dateTo } = req.body;
        const conn = (0, sf_1.getConnection)();
        const baseClauses = (0, filters_1.ownershipClauses)({ ownerRolePattern, ownerName, justMyData, currentUserId });
        const eventClauses = [...baseClauses];
        if (dateFrom)
            eventClauses.push(`StartDateTime >= ${dateFrom}T00:00:00Z`);
        if (dateTo)
            eventClauses.push(`StartDateTime <= ${dateTo}T23:59:59Z`);
        const taskClauses = [...baseClauses];
        if (dateFrom)
            taskClauses.push(`ActivityDate >= ${dateFrom}`);
        if (dateTo)
            taskClauses.push(`ActivityDate <= ${dateTo}`);
        const eventWhere = eventClauses.length ? `WHERE ${eventClauses.join(' AND ')}` : '';
        const taskWhere = taskClauses.length ? `WHERE ${taskClauses.join(' AND ')}` : '';
        // Rich queries with account names, opp context, and duration
        const [events, tasks] = await Promise.all([
            conn.query(`SELECT Id, Subject, StartDateTime, EndDateTime, DurationInMinutes, SE_Task_Type__c, Meeting_Type__c,
                OwnerId, Owner.Name, WhatId, What.Name, AccountId, Account.Name
         FROM Event ${eventWhere}
         ORDER BY StartDateTime DESC NULLS LAST LIMIT 100`),
            conn.query(`SELECT Id, Subject, ActivityDate, SE_Task_Type__c, Status,
                OwnerId, Owner.Name, WhatId, What.Name, AccountId
         FROM Task ${taskWhere}
         ORDER BY ActivityDate DESC NULLS LAST LIMIT 100`),
        ]);
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const periodLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : now;
        const title = `SE Activities Rollup — ${periodLabel}`;
        const dataJson = JSON.stringify({
            title,
            period: periodLabel,
            generatedAt: now,
            events: events.records.map(e => ({
                date: e.StartDateTime?.slice(0, 10),
                subject: e.Subject,
                taskType: e.SE_Task_Type__c,
                meetingType: e.Meeting_Type__c,
                durationMins: e.DurationInMinutes ?? 0,
                durationHours: e.DurationInMinutes ? Math.round((e.DurationInMinutes / 60) * 10) / 10 : 0,
                owner: e['Owner.Name'] ?? e.Owner?.Name ?? e.OwnerId,
                account: e['Account.Name'] ?? e.Account?.Name,
                relatedTo: e['What.Name'] ?? e.What?.Name,
            })),
            tasks: tasks.records.map(t => ({
                date: t.ActivityDate,
                subject: t.Subject,
                taskType: t.SE_Task_Type__c,
                status: t.Status,
                owner: t.Owner?.Name ?? t.OwnerId,
                relatedTo: t['What.Name'] ?? t.What?.Name,
            })),
        }, null, 2);
        const totalEvents = events.records.length;
        const totalTasks = tasks.records.length;
        const totalHours = Math.round(events.records.reduce((s, e) => s + (e.DurationInMinutes ?? 0), 0) / 60 * 10) / 10;
        const prompt = `You are creating a Slack Canvas summarizing SE activity data for the period ${periodLabel}. Use the slack_create_canvas tool.

Title: "${title}"

Here is the raw activity data from Salesforce (${totalEvents} events totaling ${totalHours}h, ${totalTasks} tasks):

${dataJson}

Create a well-formatted, professional Slack Canvas structured exactly like this:

## Executive Summary
- Total customer-facing activities: ${totalEvents} events + ${totalTasks} tasks
- Total customer hours: ${totalHours}h
- Period: ${periodLabel}
- Accounts covered: [count of unique accounts]
- Top SE task types by hours: [top 3 with hours and counts]
- Key highlight: [one sentence on the most significant activity pattern]

## Activity Metrics
[Table: SE Task Type | Count | Total Hours | Avg Duration — sorted by total hours desc. Always include hours, not just counts.]

## Activity by Account
[For each account: account name as subheader, total hours, list of activities with date, type, and duration. Sort accounts by total hours desc.]

## Notable Activity
[Bullet points: most hours spent, any demos/POCs, discovery calls, executive meetings — always reference hours not just counts]

Always use hours as the primary metric alongside counts. Return only the canvas URL after creating it.`;
        const url = await (0, slack_1.createCanvas)(title, prompt);
        res.json({ url });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/canvas/dcs', async (req, res) => {
    try {
        const { ownerRolePattern, ownerName, justMyData, currentUserId, dateFrom, dateTo } = req.body;
        const conn = (0, sf_1.getConnection)();
        const baseClauses = (0, filters_1.ownershipClauses)({ ownerRolePattern, ownerName, justMyData, currentUserId });
        const dcClauses = [...baseClauses];
        if (dateFrom)
            dcClauses.push(`Opportunity_Close_Date__c >= ${dateFrom}`);
        if (dateTo)
            dcClauses.push(`Opportunity_Close_Date__c <= ${dateTo}`);
        const where = dcClauses.length ? `WHERE ${dcClauses.join(' AND ')}` : '';
        const dcs = await conn.query(`SELECT Opportunity__r.Name, Opportunity__r.StageName, Opportunity__r.ForecastCategoryName,
              Opportunity__r.Account.Name, SE_Full_Name__c, SE_Name__r.UserRole.Name,
              Opportunity_Role__c, Split_Percentage__c, Split_Amount__c,
              Opportunity_Amount__c, Opportunity_Close_Date__c, Opportunity_Closed__c,
              SE_Region__c, SE_Classification__c
       FROM Deal_Contribution__c ${where}
       ORDER BY Opportunity_Close_Date__c ASC NULLS LAST LIMIT 100`);
        const records = dcs.records;
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const periodLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : now;
        const title = `Deal Contributions Rollup — ${periodLabel}`;
        const dataJson = JSON.stringify({
            title,
            period: periodLabel,
            generatedAt: now,
            dealContributions: records.map(r => ({
                opportunity: r.Opportunity__r?.Name,
                account: r.Opportunity__r?.Account?.Name ?? r.Opportunity__r?.['Account.Name'],
                stage: r.Opportunity__r?.StageName,
                forecastCategory: r.Opportunity__r?.ForecastCategoryName,
                closeDate: r.Opportunity_Close_Date__c,
                closed: r.Opportunity_Closed__c,
                se: r.SE_Full_Name__c,
                seRole: r.SE_Name__r?.UserRole?.Name,
                oppRole: r.Opportunity_Role__c,
                splitPct: r.Split_Percentage__c,
                splitAmount: r.Split_Amount__c,
                oppAmount: r.Opportunity_Amount__c,
                region: r.SE_Region__c,
                classification: r.SE_Classification__c,
            })),
        }, null, 2);
        const records2 = records;
        const totalPipeline = records2.reduce((s, r) => s + (r.Opportunity_Amount__c ?? 0), 0);
        const totalSplit = records2.reduce((s, r) => s + (r.Split_Amount__c ?? 0), 0);
        const fmt$ = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`;
        const prompt = `You are creating a Slack Canvas summarizing SE Deal Contribution data for the period ${periodLabel}. Use the slack_create_canvas tool.

Title: "${title}"

Here is the raw Deal Contribution data from Salesforce (${records2.length} DCs, ${fmt$(totalPipeline)} total pipeline, ${fmt$(totalSplit)} total split value):

${dataJson}

Create a well-formatted, professional Slack Canvas structured exactly like this:

## Executive Summary
- Total Deal Contributions: ${records2.length}
- Total Pipeline Influenced: ${fmt$(totalPipeline)}
- Total Split Value: ${fmt$(totalSplit)}
- Period: ${periodLabel}
- Open vs Closed: [counts]
- Top forecast categories: [Commit/Best Case/Pipeline counts]

## Pipeline by Account
[Table: Account | Opportunity | Stage | Forecast | Close Date | Split % | Split $ — sorted by split $ desc]

## Deals Closing Soon 🔥
[Any deals closing within 30 days from today — highlight with urgency]

## Commit & Best Case
[Separate section for highest-confidence deals with amounts]

## Summary by Role
[If multiple SE roles, break down by role type]

Use bold headers, tables, and flag urgent items clearly. Return only the canvas URL after creating it.`;
        const url = await (0, slack_1.createCanvas)(title, prompt);
        res.json({ url });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
