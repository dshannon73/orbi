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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white text-xl font-bold">O</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Orbi <span className="text-blue-500">✦</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">your SE command center</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {error && (
            <div className="mb-4 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect to Salesforce'
            )}
          </button>

          <p className="mt-3 text-center text-xs text-slate-400">
            Uses your active Salesforce CLI session
          </p>
        </div>
      </div>
    </div>
  );
}
