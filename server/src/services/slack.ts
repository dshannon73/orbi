import { App, ExpressReceiver } from '@slack/bolt';
import { getConnection } from '../sf';

export function createSlackReceiver() {
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    endpoints: '/slack/events',
  });

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
  });

  // /sf-tasks [userId]
  app.command('/sf-tasks', async ({ command, ack, respond }) => {
    await ack();
    try {
      const conn = getConnection();
      const result = await conn.query(
        `SELECT Subject, Status, Priority, ActivityDate FROM Task WHERE IsClosed = false ORDER BY ActivityDate ASC NULLS LAST LIMIT 10`
      );
      const lines = result.records.map((t: any) =>
        `• *${t.Subject}* — ${t.Status} (${t.Priority}) ${t.ActivityDate ? `📅 ${t.ActivityDate}` : ''}`
      );
      await respond({ text: `*Open Tasks*\n${lines.join('\n') || 'None found.'}` });
    } catch (err: any) {
      await respond({ text: `Error: ${err.message}` });
    }
  });

  // /sf-travel [status]
  app.command('/sf-travel', async ({ command, ack, respond }) => {
    await ack();
    try {
      const conn = getConnection();
      const status = command.text.trim() || null;
      let where = 'WHERE IsDeleted = false';
      if (status) where += ` AND Approval_Status__c = '${status}'`;
      const result = await conn.query(
        `SELECT Name, Approval_Status__c, Travel_Start_Date__c, Travel_End_Date__c, Total_Cost__c, Owner.Name FROM Travel_Approval__c ${where} ORDER BY Travel_Start_Date__c DESC LIMIT 10`
      );
      const lines = result.records.map((t: any) =>
        `• *${t.Name}* — ${t.Approval_Status__c} | ${t.Travel_Start_Date__c} → ${t.Travel_End_Date__c} | $${t.Total_Cost__c} | ${t['Owner.Name'] || t.Owner?.Name}`
      );
      await respond({ text: `*Travel Approvals*\n${lines.join('\n') || 'None found.'}` });
    } catch (err: any) {
      await respond({ text: `Error: ${err.message}` });
    }
  });

  // /sf-opps [ownerId]
  app.command('/sf-opps', async ({ command, ack, respond }) => {
    await ack();
    try {
      const conn = getConnection();
      const result = await conn.query(
        `SELECT Name, StageName, Amount, CloseDate, Account.Name FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 10`
      );
      const lines = result.records.map((o: any) =>
        `• *${o.Name}* (${o['Account.Name'] || o.Account?.Name}) — ${o.StageName} | $${o.Amount} | 📅 ${o.CloseDate}`
      );
      await respond({ text: `*Open Opportunities*\n${lines.join('\n') || 'None found.'}` });
    } catch (err: any) {
      await respond({ text: `Error: ${err.message}` });
    }
  });

  return receiver.router;
}

export async function postToSlack(channel: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN not set');
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  });
  return resp.json();
}
