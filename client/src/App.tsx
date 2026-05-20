import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import {
  LayoutDashboard, CheckSquare, Briefcase, Building2,
  Users, Plane, TrendingUp, UserCircle, LogOut, Calendar, Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api';
import { useUserPrefs } from '@/store/userPrefs';
import { useFilters } from '@/store/filters';
import { useAssistantFilters } from '@/store/assistant';
import { AuthGuard } from '@/components/AuthGuard';
import Activities from '@/pages/Activities';
import DealContributions from '@/pages/DealContributions';
import Accounts from '@/pages/Accounts';
import UsersList from '@/pages/UsersList';
import Opportunities from '@/pages/Opportunities';
import TravelApprovals from '@/pages/TravelApprovals';
import Dashboard from '@/pages/Dashboard';
import Profile from '@/pages/Profile';
import Login from '@/pages/Login';
import CalendarPage from '@/pages/Calendar';
import Assistant from '@/pages/Assistant';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assistant', label: 'Orbi Agent', icon: Sparkles },
  { to: '/activities', label: 'Activities', icon: CheckSquare },
  { to: '/deal-contributions', label: 'Deal Contributions', icon: Briefcase },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
  { to: '/opportunities', label: 'Opportunities', icon: TrendingUp },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/travel-approvals', label: 'Travel Approvals', icon: Plane },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

function MainLayout() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const { defaultRoleFilter } = useUserPrefs();
  const { ownerRolePattern, setOwnerRolePattern } = useFilters();
  const { roleFilter, setRoleFilter } = useAssistantFilters();

  // Seed role filter fields from profile default when they're blank
  useEffect(() => {
    if (!ownerRolePattern && defaultRoleFilter) setOwnerRolePattern(defaultRoleFilter);
    if (!roleFilter && defaultRoleFilter) setRoleFilter(defaultRoleFilter);
  }, [defaultRoleFilter]);

  async function handleSignOut() {
    await authApi.logout().catch(() => {});
    setUser(null);
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800">
        <div className="px-4 py-5 border-b border-slate-800">
          <span className="text-lg font-bold text-white tracking-tight">Orbi</span>
          <span className="ml-2 text-xs text-blue-400 font-medium">✦ SE</span>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'text-white bg-blue-600/20 border-r-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )}
            >
              <Icon size={15} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-800">
          {user ? (
            <div className="flex items-center gap-2.5">
              {user.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full shrink-0 object-cover ring-1 ring-slate-700"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <UserCircle size={28} className="text-slate-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="shrink-0 text-slate-500 hover:text-slate-200 transition-colors"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">your SE command center</p>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-screen-2xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/deal-contributions" element={<DealContributions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/users" element={<UsersList />} />
            <Route path="/travel-approvals" element={<TravelApprovals />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <MainLayout />
          </AuthGuard>
        }
      />
    </Routes>
  );
}
