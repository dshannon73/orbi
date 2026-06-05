import { App, ExpressReceiver } from '@slack/bolt';
import { getConnection } from '../sf';
import { spawn } from 'child_process';

const CLAUDE_PATH = '/Users/dshannon/.local/bin/claude';
const CLAUDE_ENV = { ...process.env, PATH: `${process.env.PATH}:/Users/dshannon/.local/bin` };

function runClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_PATH, ['--print', '--dangerously-skip-permissions', '--output-format', 'text'], {
      env: CLAUDE_ENV,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('claude subprocess timed out'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.trim()}`));
      resolve(stdout.trim());
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

export function createSlackReceiver() {
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    endpoints: '/slack/events',
  });

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
  });

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

export async function postToSlack(channelName: string, text: string) {
  const prompt = [
    `Use the slack_search_channels tool to find the channel "${channelName.replace(/^#/, '')}",`,
    `then use slack_send_message to send this message to it:`,
    text,
    `Return only "ok" when done.`,
  ].join('\n');

  const output = await runClaude(prompt);
  return { ok: true, response: output };
}

export async function createCanvas(title: string, prompt: string): Promise<string> {
  // prompt is the full instruction including data — Claude formats and creates the canvas
  const output = await runClaude(prompt, 120_000);
  const url = output.match(/https:\/\/\S+\.slack\.com\/docs\/\S+/)?.[0];
  if (!url) throw new Error(`No canvas URL in response: ${output.slice(0, 300)}`);
  return url;
}
