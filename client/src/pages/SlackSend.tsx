import { useState } from 'react';
import { Send, FileText, TrendingUp, CheckSquare } from 'lucide-react';
import { slackApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';
import { useGlobalParams } from '@/api';
import { DateRangeFilter, resolveDateRange } from '@/components/DateRangeFilter';
import { usePageFilters } from '@/store/pageFilters';

const PAGE = 'slack';

type PostStatus = 'idle' | 'loading' | 'ok' | 'err';

function StatusBanner({ status, okMsg, errMsg }: { status: PostStatus; okMsg: string; errMsg: string }) {
  if (status === 'ok') return <div className="mb-4 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">{okMsg}</div>;
  if (status === 'err') return <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-mono text-xs">{errMsg}</div>;
  return null;
}

export default function SlackPage() {
  const globalParams = useGlobalParams();
  const pf = usePageFilters();
  const datePreset = pf.get(PAGE, 'datePreset', 'current_fq');
  const customFrom  = pf.get(PAGE, 'dateFrom');
  const customTo    = pf.get(PAGE, 'dateTo');
  const { from, to } = resolveDateRange(datePreset, customFrom, customTo);

  // Quick send
  const [channel, setChannel] = useState('#general');
  const [text, setText] = useState('');
  const [sendStatus, setSendStatus] = useState<PostStatus>('idle');
  const [sendErr, setSendErr] = useState('');

  // Canvas buttons
  const [activitiesStatus, setActivitiesStatus] = useState<PostStatus>('idle');
  const [activitiesErr, setActivitiesErr] = useState('');
  const [dcsStatus, setDcsStatus] = useState<PostStatus>('idle');
  const [dcsErr, setDcsErr] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendStatus('loading');
    try {
      await slackApi.send(channel, text);
      setSendStatus('ok');
      setText('');
      setTimeout(() => setSendStatus('idle'), 4000);
    } catch (err: any) {
      setSendErr(err?.response?.data?.error ?? err?.message ?? 'Unknown error');
      setSendStatus('err');
    }
  }

  async function postCanvas(
    type: 'activities' | 'dcs',
    setStatus: (s: PostStatus) => void,
    setErr: (s: string) => void,
  ) {
    setStatus('loading');
    try {
      const resp = await slackApi.postCanvas(type, {
        ...globalParams,
        ...(from ? { dateFrom: from } : {}),
        ...(to   ? { dateTo: to }   : {}),
      });
      setStatus('ok');
      const url: string | undefined = resp.data?.url;
      if (url) window.open(url, '_blank', 'noopener');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err: any) {
      setErr(err?.response?.data?.error ?? err?.message ?? 'Unknown error');
      setStatus('err');
    }
  }

  return (
    <div>
      <PageHeader title="Slack" />

      {/* Canvas rollup section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Post to Canvas</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl space-y-4">
          <div className="flex items-center gap-4">
            <DateRangeFilter page={PAGE} defaultPreset="current_fq" label="Period" />
            <p className="text-xs text-slate-500 mt-4">Creates a Slack Canvas from your SF data for the selected period.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Activities canvas */}
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CheckSquare size={15} className="text-violet-500" />
                Activities Rollup
              </div>
              <p className="text-xs text-slate-500">Post a canvas summary of your recent SE activities — counts by type, top accounts, and highlights.</p>
              <StatusBanner
                status={activitiesStatus}
                okMsg="Canvas created — opening…"
                errMsg={activitiesErr}
              />
              <Button
                variant="slack"
                size="sm"
                disabled={activitiesStatus === 'loading'}
                onClick={() => postCanvas('activities', setActivitiesStatus, setActivitiesErr)}
              >
                <FileText size={13} />
                {activitiesStatus === 'loading' ? 'Posting…' : 'Post Activities Canvas'}
              </Button>
            </div>

            {/* DCs canvas */}
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <TrendingUp size={15} className="text-amber-500" />
                Deal Contributions Rollup
              </div>
              <p className="text-xs text-slate-500">Post a canvas summary of deal contributions — total pipeline, splits by role, and top opps.</p>
              <StatusBanner
                status={dcsStatus}
                okMsg="Canvas created — opening…"
                errMsg={dcsErr}
              />
              <Button
                variant="slack"
                size="sm"
                disabled={dcsStatus === 'loading'}
                onClick={() => postCanvas('dcs', setDcsStatus, setDcsErr)}
              >
                <FileText size={13} />
                {dcsStatus === 'loading' ? 'Posting…' : 'Post DC Canvas'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick send section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Send</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
          <StatusBanner
            status={sendStatus}
            okMsg="Message sent!"
            errMsg={sendErr}
          />
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
            <Button variant="slack" type="submit" disabled={sendStatus === 'loading'}>
              <Send size={14} />
              {sendStatus === 'loading' ? 'Sending…' : 'Send to Slack'}
            </Button>
          </form>
        </div>
      </div>

    </div>
  );
}
