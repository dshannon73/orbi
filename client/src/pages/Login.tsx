import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/auth';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  async function handleSignIn() {
    setError('');
    setLoading(true);
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
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#0a0917' }}
    >
      {/* Background orbital rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Ring 1 */}
        <div
          className="orbit-1 absolute"
          style={{
            width: 520, height: 520,
            border: '1px solid rgba(245,158,11,0.08)',
            borderRadius: '50%',
          }}
        >
          <div
            className="absolute"
            style={{
              top: -4, left: '30%',
              width: 8, height: 8,
              borderRadius: '50%',
              background: '#f59e0b',
              boxShadow: '0 0 12px 4px rgba(245,158,11,0.4)',
            }}
          />
        </div>

        {/* Ring 2 */}
        <div
          className="orbit-2 absolute"
          style={{
            width: 700, height: 700,
            border: '1px solid rgba(99,90,180,0.1)',
            borderRadius: '50%',
          }}
        >
          <div
            className="absolute"
            style={{
              bottom: -3, right: '20%',
              width: 6, height: 6,
              borderRadius: '50%',
              background: '#8b80e0',
              boxShadow: '0 0 10px 3px rgba(139,128,224,0.4)',
            }}
          />
        </div>

        {/* Ring 3 */}
        <div
          className="orbit-3 absolute"
          style={{
            width: 900, height: 900,
            border: '1px solid rgba(245,158,11,0.04)',
            borderRadius: '50%',
          }}
        />

        {/* Center glow */}
        <div
          className="absolute"
          style={{
            width: 300, height: 300,
            background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(245,158,11,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,158,11,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="text-center mb-10">
          {/* Logo mark */}
          <div className="inline-flex items-center justify-center mb-5 relative">
            <div
              className="absolute"
              style={{
                width: 64, height: 64,
                border: '1.5px solid rgba(245,158,11,0.3)',
                borderRadius: '50%',
              }}
            />
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #1a1829, #0e0d1a)',
                border: '1px solid rgba(245,158,11,0.2)',
                boxShadow: '0 0 30px rgba(245,158,11,0.15)',
              }}
            >
              <span
                className="text-2xl font-bold"
                style={{ fontFamily: 'var(--font-display)', color: '#f59e0b' }}
              >
                O
              </span>
            </div>
          </div>

          <h1
            className="text-4xl font-bold text-white mb-1"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
          >
            Orbi
          </h1>
          <p className="text-sm" style={{ color: '#5c5a78' }}>
            SE Command Center
          </p>
        </div>

        {/* Login card */}
        <div
          className="rounded-2xl p-7"
          style={{
            background: 'rgba(20, 19, 35, 0.8)',
            border: '1px solid rgba(245,158,11,0.12)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {error && (
            <div
              className="mb-5 px-4 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#fca5a5',
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer"
            style={{
              background: loading
                ? 'rgba(245,158,11,0.4)'
                : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: loading ? 'rgba(255,255,255,0.6)' : '#0e0d1a',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(245,158,11,0.35)',
              transform: loading ? 'none' : undefined,
            }}
          >
            {loading ? (
              <>
                <div
                  className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'transparent' }}
                />
                <span>Connecting…</span>
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
            Uses your active Salesforce CLI session
          </p>
        </div>

        {/* Bottom tagline */}
        <p className="text-center text-[10px] mt-8 tracking-widest uppercase" style={{ color: '#2a2840' }}>
          Built for SE Excellence
        </p>
      </div>
    </div>
  );
}
