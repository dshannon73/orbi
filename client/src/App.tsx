import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  { to: '/',                   label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/assistant',          label: 'Orbi Agent',        icon: Sparkles },
  { to: '/activities',         label: 'Activities',        icon: CheckSquare },
  { to: '/deal-contributions', label: 'Deal Contributions',icon: Briefcase },
  { to: '/accounts',           label: 'Accounts',          icon: Building2 },
  { to: '/opportunities',      label: 'Opportunities',     icon: TrendingUp },
  { to: '/calendar',           label: 'Calendar',          icon: Calendar },
  { to: '/users',              label: 'Users',             icon: Users },
  { to: '/travel-approvals',   label: 'Travel Approvals',  icon: Plane },
  { to: '/profile',            label: 'Profile',           icon: UserCircle },
];

function MainLayout() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { defaultRoleFilter } = useUserPrefs();
  const { ownerRolePattern, setOwnerRolePattern } = useFilters();
  const { roleFilter, setRoleFilter } = useAssistantFilters();

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
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-surface)' }}>
      {/* Sidebar */}
      <aside
        className="w-52 flex flex-col shrink-0"
        style={{
          background: 'var(--color-sidebar)',
          borderRight: '1px solid var(--color-sidebar-border)',
        }}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}>
          <div className="flex items-baseline gap-2">
            <span
              className="text-2xl font-bold tracking-tight text-white"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
            >
              Orbi
            </span>
            <span
              className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: '#f59e0b' }}
            >
              SE
            </span>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: '#4a4860' }}>command center</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'text-white nav-active-bar'
                  : 'hover:bg-[#1a1929] hover:text-slate-200',
              )}
              style={({ isActive }) => isActive
                ? { color: '#ffffff', background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.07))' }
                : { color: '#5c5a78' }
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={14}
                    className="shrink-0"
                    style={{ color: isActive ? '#f59e0b' : undefined }}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--color-sidebar-border)' }}>
          {user ? (
            <div className="flex items-center gap-2.5">
              {user.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.name}
                  className="w-7 h-7 rounded-full shrink-0 object-cover"
                  style={{ outline: '1.5px solid #2a2840' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                  style={{ background: '#f59e0b', color: '#0e0d1a' }}
                >
                  {user.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white truncate leading-tight">{user.name}</p>
                <p className="text-[10px] truncate" style={{ color: '#4a4860' }}>{user.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="shrink-0 transition-colors hover:opacity-80 cursor-pointer"
                style={{ color: '#3a3856' }}
                title="Sign out"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <p className="text-[10px]" style={{ color: '#3a3856' }}>SE command center</p>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <div
          key={location.pathname}
          className="max-w-screen-2xl mx-auto px-7 py-7 page-enter"
        >
          <Routes>
            <Route path="/"                   element={<Dashboard />} />
            <Route path="/activities"         element={<Activities />} />
            <Route path="/opportunities"      element={<Opportunities />} />
            <Route path="/deal-contributions" element={<DealContributions />} />
            <Route path="/accounts"           element={<Accounts />} />
            <Route path="/users"              element={<UsersList />} />
            <Route path="/travel-approvals"   element={<TravelApprovals />} />
            <Route path="/calendar"           element={<CalendarPage />} />
            <Route path="/assistant"          element={<Assistant />} />
            <Route path="/profile"            element={<Profile />} />
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
