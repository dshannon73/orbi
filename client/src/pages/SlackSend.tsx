import { useState } from 'react';
import { Send } from 'lucide-react';
import { slackApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';

export default function SlackSend() {
  const [channel, setChannel] = useState('#general');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      await slackApi.send(channel, text);
      setStatus('ok');
      setText('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('err');
    }
  }

  return (
    <div>
      <PageHeader title="Send to Slack" />

      {status === 'ok' && <div className="mb-4 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">Message sent!</div>}
      {status === 'err' && <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">Failed. Check your SLACK_BOT_TOKEN in server/.env</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Channel</label>
            <Input value={channel} onChange={e => setChannel(e.target.value)} placeholder="#general" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type your message…"
              required
              rows={5}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-sans"
            />
          </div>
          <Button variant="slack" type="submit" disabled={status === 'sending'}>
            <Send size={14} />
            {status === 'sending' ? 'Sending…' : 'Send to Slack'}
          </Button>
        </form>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Available Slash Commands</h3>
        <p className="text-xs text-slate-500 mb-3">Once your Slack app is configured with a bot token and signing secret:</p>
        <div className="space-y-2">
          {[
            ['/sf-tasks', 'List your open tasks'],
            ['/sf-travel [status]', 'List travel approvals (optional: Approved, Pending Approval, Rejected)'],
            ['/sf-opps', 'List open opportunities'],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex items-start gap-3 py-2 px-3 bg-slate-50 rounded-lg">
              <code className="text-xs font-mono text-violet-700 bg-violet-50 px-2 py-0.5 rounded shrink-0">{cmd}</code>
              <span className="text-xs text-slate-600">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
