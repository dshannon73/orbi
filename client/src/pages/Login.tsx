import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/auth';

export default function Login() {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  async function handleSignIn() {
    setError('');
    setStatus('');
    setLoading(true);

    // First try a direct login with the existing CLI token
    try {
      const res = await authApi.login('', '');
      const u = res.data.user;
      setUser({
        id: u.userId || u.user_id || u.Id,
        name: u.userName || u.display_name || u.Name,
        email: u.userEmail || u.email || u.Email,
        photoUrl: u.photoUrl || undefined,
      });
      navigate('/');
      return;
    } catch {
      // Token expired — fall through to browser auth flow
    }

    // Launch browser-based reconnect via SSE
    setStatus('Opening Salesforce login in your browser…');
    try {
      const res = await fetch(`${window.location.protocol}//${window.location.hostname}:3001/api/auth/reconnect`, {
        method: 'POST',
        credentials: 'include',
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.message) setStatus(ev.message);
            if (ev.error) { setError(ev.error); setLoading(false); return; }
            if (ev.done && ev.user) {
              setUser({
                id: ev.user.userId,
                name: ev.user.userName,
                email: ev.user.userEmail,
              });
              navigate('/');
              return;
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    }
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#0a0917' }}
    >
      {/* Background orbital rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="orbit-1 absolute" style={{ width: 520, height: 520, border: '1px solid rgba(245,158,11,0.08)', borderRadius: '50%' }}>
          <div className="absolute" style={{ top: -4, left: '30%', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 12px 4px rgba(245,158,11,0.4)' }} />
        </div>
        <div className="orbit-2 absolute" style={{ width: 700, height: 700, border: '1px solid rgba(99,90,180,0.1)', borderRadius: '50%' }}>
          <div className="absolute" style={{ bottom: -3, right: '20%', width: 6, height: 6, borderRadius: '50%', background: '#8b80e0', boxShadow: '0 0 10px 3px rgba(139,128,224,0.4)' }} />
        </div>
        <div className="orbit-3 absolute" style={{ width: 900, height: 900, border: '1px solid rgba(245,158,11,0.04)', borderRadius: '50%' }} />
        <div className="absolute" style={{ width: 300, height: 300, background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
      </div>

      {/* Grid texture */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `linear-gradient(rgba(245,158,11,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.025) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />

      {/* Astro */}
      <div className="absolute pointer-events-none" style={{ bottom: -20, right: -20, width: 340, height: 340, zIndex: 1 }}>
        <img src="/astromfg.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.55, maskImage: 'radial-gradient(ellipse at bottom right, black 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at bottom right, black 30%, transparent 75%)' }} />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1.5 }}>Orbi</h1>
          <p className="text-sm" style={{ color: '#5c5a78' }}>SE Command Center</p>
        </div>

        <div className="rounded-2xl p-7" style={{ background: 'rgba(20, 19, 35, 0.8)', border: '1px solid rgba(245,158,11,0.12)', backdropFilter: 'blur(20px)', boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)' }}>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {status && !error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
              {status}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer"
            style={{
              background: loading ? 'rgba(245,158,11,0.4)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: loading ? 'rgba(255,255,255,0.6)' : '#0e0d1a',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(245,158,11,0.35)',
            }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'transparent' }} />
                <span>Complete login in browser, then return here…</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Connect to Salesforce
              </>
            )}
          </button>

          <p className="mt-4 text-center text-[11px]" style={{ color: '#3d3b55' }}>
            Opens a browser window for Salesforce authentication
          </p>
        </div>

        <p className="text-center text-[10px] mt-8 tracking-widest uppercase" style={{ color: '#2a2840' }}>
          Built for SE Excellence
        </p>
      </div>
    </div>
  );
}
