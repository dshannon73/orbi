import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(!user);

  useEffect(() => {
    if (user) { setChecking(false); return; }
    authApi.me()
      .then(r => {
        const u = r.data.user;
        setUser({
          id: u.Id,
          name: u.Name,
          email: u.Email,
          title: u.Title,
          department: u.Department,
          role: u.UserRole?.Name,
          profile: u.Profile?.Name,
        });
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
        if (location.pathname !== '/login') navigate('/login');
      });
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
