import * as Dialog from '@radix-ui/react-dialog';
import { X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sfId?: string | null;
  children: React.ReactNode;
}

export function RecordDrawer({ open, onClose, title, sfId, children }: RecordDrawerProps) {
  const sfUrl = sfId ? `https://org62.my.salesforce.com/${sfId}` : null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 h-full w-full max-w-2xl z-50 flex flex-col',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-250'
          )}
          style={{ background: '#fefefe', borderLeft: '1px solid #e8e5de', boxShadow: '-8px 0 40px rgba(0,0,0,0.08)' }}
        >
          <div
            className="flex items-center justify-between px-6 py-4 shrink-0"
            style={{ borderBottom: '1px solid #f0ede7' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Dialog.Title
                className="text-[15px] font-semibold text-slate-900 truncate"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {title}
              </Dialog.Title>
              {sfUrl && (
                <a
                  href={sfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 transition-opacity hover:opacity-60"
                  style={{ color: '#d97706' }}
                  title="Open in Salesforce"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-lg p-1.5 transition-colors cursor-pointer"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f4f1ea'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-5">{children}</dl>;
}

export function DetailField({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'col-span-2')}>
      <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</dt>
      <dd className="text-[13px] text-slate-800">
        {value ?? <span className="text-slate-300">—</span>}
      </dd>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h3
        className="text-[10px] font-semibold uppercase tracking-widest mb-4 pb-2"
        style={{
          color: '#d97706',
          borderBottom: '1px solid #fde68a',
          fontFamily: 'var(--font-display)',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
