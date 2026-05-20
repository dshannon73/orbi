import { cn } from '@/lib/utils';

interface RecordLinkProps {
  label: string | null | undefined;
  onClick?: () => void;
  className?: string;
}

export function RecordLink({ label, onClick, className }: RecordLinkProps) {
  if (!label) return <span className="text-slate-400">—</span>;
  if (!onClick) return <span>{label}</span>;
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-blue-600 hover:text-blue-800 hover:underline text-left font-medium cursor-pointer bg-transparent border-0 p-0 transition-colors',
        className
      )}
    >
      {label}
    </button>
  );
}
