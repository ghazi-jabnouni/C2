import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  GitFork,
  FolderGit2,
  Server,
  KeyRound,
  CalendarClock,
  Clock,
  Key,
  Users,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Search,
  Zap,
  Sliders,
  Sparkles,
  Info
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

interface AppLayoutProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
  onQuickLaunch?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onTabChange,
  children,
  onQuickLaunch
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('app_sidebar_visible');
    return saved !== null ? saved === 'true' : true;
  });
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('app_sidebar_visible', String(sidebarVisible));
  }, [sidebarVisible]);

  // Fetch pending count periodically
  useEffect(() => {
    const checkPending = async () => {
      try {
        const stats = await api.getStats();
        setPendingCount(stats.pendingApprovalsCount || 0);
      } catch (e) {
        // ignore
      }
    };
    checkPending();
    const interval = setInterval(checkPending, 8000);
    return () => clearInterval(interval);
  }, []);

  const isRequester = user?.role === 'Requester';

  const allNavItems = [
    { id: 'request-catalog', label: 'Service Catalog', icon: Sparkles, badge: 'Self-Service' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'templates', label: 'Task Templates', icon: Layers },
    { id: 'database-types', label: 'Task Types', icon: Server },
    { id: 'workflows', label: 'Visual Workflows', icon: GitFork, badge: 'DAG' },
    { id: 'repositories', label: 'Repositories', icon: FolderGit2 },
    { id: 'inventories', label: 'Inventories', icon: Server },
    { id: 'credentials', label: 'Credentials Vault', icon: KeyRound },
    { id: 'environments', label: 'Environment Vars', icon: Sliders },
    { id: 'schedules', label: 'Scheduled Tasks', icon: CalendarClock },
    {
      id: 'pending-requests',
      label: isRequester ? 'My Requests' : 'Pending Approvals',
      icon: Clock,
      count: pendingCount
    },
    { id: 'api-tokens', label: 'API & Webhooks', icon: Key },
    { id: 'users', label: 'Team & RBAC', icon: Users },
    { id: 'system-info', label: 'System Info', icon: Info, badge: 'Tools' }
  ];

  const navItems = isRequester
    ? allNavItems.filter(item => item.id === 'request-catalog' || item.id === 'pending-requests')
    : allNavItems;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', overflowX: 'hidden', position: 'relative' }}>
      {/* ========================================================================= */}
      {/* FIXED SIDEBAR (Show/Hide) */}
      {/* ========================================================================= */}
      <aside
        style={{
          width: '260px',
          backgroundColor: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          height: '100vh',
          zIndex: 50,
          flexShrink: 0,
          userSelect: 'none',
          transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: sidebarVisible ? '4px 0 16px rgba(0, 0, 0, 0.08)' : 'none'
        }}
      >
        {/* Brand Header with Hide Button */}
        <div
          style={{
            padding: '18px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            minHeight: '70px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)'
              }}
            >
              <Zap size={20} color="#ffffff" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--sidebar-text-primary)' }}>
                C2 <span style={{ color: 'var(--accent-primary)' }}>Platform</span>
              </h1>
              <span style={{ fontSize: '0.68rem', color: 'var(--sidebar-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Command & Control
              </span>
            </div>
          </div>

          {/* Hide Sidebar Button */}
          <button
            onClick={() => setSidebarVisible(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Hide Sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav
          style={{
            flex: 1,
            padding: '12px 8px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  backgroundColor: isActive ? 'var(--accent-primary-light)' : 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--sidebar-text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  border: isActive ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none'
                }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.875rem', flex: 1, textAlign: 'left' }}>
                  {item.label}
                </span>

                {item.count !== undefined && item.count > 0 && (
                  <span
                    className="badge badge-danger pulse-running"
                    style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 999 }}
                  >
                    {item.count}
                  </span>
                )}

                {item.badge && (
                  <span
                    className="badge badge-info"
                    style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4 }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Controls */}
          <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          {/* Theme Switcher in Sidebar */}
          <button
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--sidebar-text-primary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem'
            }}
          >
            {theme === 'dark' ? (
              <Sun size={17} style={{ color: '#f59e0b', flexShrink: 0 }} />
            ) : (
              <Moon size={17} style={{ color: '#6366f1', flexShrink: 0 }} />
            )}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* User Profile Mini + Logout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--sidebar-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'Unknown User'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--sidebar-text-secondary)' }}>{user?.role || 'Member'}</div>
              <button
                onClick={() => { logout(); }}
                style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: '0.75rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT WRAPPER (Auto-expands when sidebar is hidden) */}
      {/* ========================================================================= */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflowY: 'auto',
          marginLeft: sidebarVisible ? '260px' : '0px',
          transition: 'margin-left 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          minHeight: '100vh',
          width: '100%'
        }}
      >
        {/* Top Header Bar */}
        <header
          style={{
            height: '70px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 30
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Show / Hide Sidebar Toggle Button */}
            <button
              onClick={() => setSidebarVisible(!sidebarVisible)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: sidebarVisible ? 'var(--bg-tertiary)' : 'var(--accent-primary-light)',
                color: sidebarVisible ? 'var(--text-primary)' : 'var(--accent-primary)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
            >
              {sidebarVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
              <span>{sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}</span>
            </button>

            {/* Quick Search */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 340,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Search
                size={15}
                style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Search templates, playbooks, logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-control"
                style={{
                  paddingLeft: 36,
                  height: 36,
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  fontSize: '0.825rem'
                }}
              />
            </div>
          </div>

          {/* Top Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Quick Launch Template Button */}
            {onQuickLaunch && (
              <button
                className="btn btn-primary btn-sm"
                onClick={onQuickLaunch}
                style={{ height: 36, padding: '0 14px' }}
              >
                <Zap size={15} />
                <span>Launch Task</span>
              </button>
            )}

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => onTabChange('pending-requests')}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title={`${pendingCount} pending requests`}
              >
                <Bell size={17} />
                {pendingCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                      border: '2px solid var(--bg-secondary)'
                    }}
                  />
                )}
              </button>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? (
                <Sun size={17} style={{ color: '#f59e0b' }} />
              ) : (
                <Moon size={17} style={{ color: '#6366f1' }} />
              )}
            </button>
          </div>
        </header>

        {/* Page Main Content */}
        <main style={{ padding: '24px 28px', flex: 1, minHeight: 'calc(100vh - 70px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
};
