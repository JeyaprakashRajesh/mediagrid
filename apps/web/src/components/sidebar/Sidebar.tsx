import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Film,
  Music,
  Image as ImageIcon,
  Activity,
  HardDrive,
  Users,
  QrCode,
  User,
  Cloud,
} from 'lucide-react';
import type { CategoryId } from '@mediagrid/types';

const categoryIcons: Record<CategoryId, React.ComponentType<any>> = {
  movies: Film,
  music: Music,
  photos: ImageIcon,
  drive: HardDrive,
};

export const Sidebar: React.FC = () => {
  const {
    websocketStatus,
    runtime,
    categories,
    selectedCategory,
    currentView,
    user,
    performLogout,
  } = useAppStore();

  const [isMobile, setIsMobile] = React.useState(false);
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    setIsMobile(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Close menu when clicking outside
  React.useEffect(() => {
    if (!showProfileMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.nav-profile-wrapper')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showProfileMenu]);

  const handleCategorySelect = (categoryId: CategoryId) => {
    window.location.hash = `#/library/${categoryId}`;
  };

  const getStatusText = () => {
    switch (websocketStatus) {
      case 'connected':
        return 'Runtime Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Runtime Offline';
    }
  };

  const getBannerClass = () => {
    switch (websocketStatus) {
      case 'connected':
        return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
      case 'connecting':
        return 'border-amber-500/20 bg-amber-500/5 text-amber-400';
      case 'disconnected':
        return 'border-rose-500/20 bg-rose-500/5 text-rose-400';
    }
  };

  const getDotClass = () => {
    switch (websocketStatus) {
      case 'connected':
        return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
      case 'connecting':
        return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-pulse';
      case 'disconnected':
        return 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]';
    }
  };

  const handleLogout = () => {
    performLogout();
  };

  const workspaceShortcuts = [
    { id: 'devices', label: 'Devices', icon: Users, hash: '#/devices' },
    { id: 'pairing', label: 'Pairing', icon: QrCode, hash: '#/pairing' },
    { id: 'admin', label: 'Monitor', icon: Activity, hash: '#/streaming' },
  ] as const;

  return (
    <>
      <header className="navbar-container">
        {/* 1st Card: Logo and Text */}
        <div className="nav-card nav-card--brand">
          <img src="/logo.svg" alt="MediaGrid Logo" className="brand-logo-img" />
          <div className="brand-info">
            <h1 className="brand-title">MediaGrid</h1>
            <div className="nav-brand-subline">
              <span>{websocketStatus === 'connected' ? 'Live cloud sync' : 'Workspace ready'}</span>
            </div>
          </div>
        </div>

        {/* 2nd Card: Navigation Links (PC ONLY) */}
        {!isMobile && (
          <nav className="nav-card nav-card--nav" aria-label="Media categories">
            {categories.map((category) => {
              const Icon = categoryIcons[category.id] || Film;
              const isActive = category.id === selectedCategory && currentView === 'library';

              return (
                <button
                  key={category.id}
                  type="button"
                  className={`nav-pill ${isActive ? 'active' : ''}`}
                  onClick={() => handleCategorySelect(category.id)}
                  title={`${category.name} · ${category.itemCount} items`}
                >
                  <span className="nav-pill-icon-wrap">
                    <Icon size={15} />
                  </span>
                  <span className="nav-pill-copy">
                    <span className="nav-pill-text">{category.name}</span>
                    <span className="nav-pill-meta">{category.itemCount}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* 3rd Card: PC Status and Profile */}
        <div className="nav-card nav-card--status">
          <div className={`nav-status-badge ${getBannerClass()}`} title={getStatusText()}>
            <span className={`connection-dot ${getDotClass()}`} />
            <span className="nav-status-text">
              {websocketStatus === 'connected' ? 'Connected' : 'Offline'}
            </span>
          </div>

          {!isMobile && (
            <div className="nav-runtime-chip" title={runtime?.runtimeVersion || 'Runtime'}>
              <Cloud size={12} />
              <span>{runtime?.runtimeVersion ? `v${runtime.runtimeVersion}` : 'Runtime'}</span>
            </div>
          )}

          <div className="nav-divider-vertical" />

          {/* Profile Wrapper with Dropdown Menu */}
          <div className="nav-profile-wrapper">
            <button
              type="button"
              className="nav-profile"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              aria-label="User Profile"
              aria-expanded={showProfileMenu}
            >
              <div className="nav-avatar-circle" title={user?.username || 'User'}>
                <User size={14} className="text-sky-400" />
              </div>
              <div className="nav-profile-details">
                <span className="nav-username">{user?.username || 'Admin'}</span>
                <span className="nav-profile-role">Manage account</span>
              </div>
            </button>

            {showProfileMenu && (
              <div className="nav-profile-menu">
                <div className="nav-menu-header">
                  <span className="nav-menu-username">{user?.username || 'Admin'}</span>
                  <span className="nav-menu-status">Active Account</span>
                </div>
                
                <div className="nav-menu-divider" />
                
                <button
                  type="button"
                  className={`nav-menu-item ${currentView === 'devices' ? 'active' : ''}`}
                  onClick={() => {
                    window.location.hash = '#/devices';
                    setShowProfileMenu(false);
                  }}
                >
                  <Users size={14} />
                  <span>Devices</span>
                </button>

                <button
                  type="button"
                  className={`nav-menu-item ${currentView === 'pairing' ? 'active' : ''}`}
                  onClick={() => {
                    window.location.hash = '#/pairing';
                    setShowProfileMenu(false);
                  }}
                >
                  <QrCode size={14} />
                  <span>Pairing</span>
                </button>

                <button
                  type="button"
                  className={`nav-menu-item ${currentView === 'admin' ? 'active' : ''}`}
                  onClick={() => {
                    window.location.hash = '#/streaming';
                    setShowProfileMenu(false);
                  }}
                >
                  <Activity size={14} />
                  <span>Monitor</span>
                </button>

                <div className="nav-menu-divider" />

                <button
                  type="button"
                  className="nav-menu-item nav-menu-item--logout"
                  onClick={() => {
                    handleLogout();
                    setShowProfileMenu(false);
                  }}
                >
                  <User size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!isMobile && (
        <div className="nav-workspace-dock" aria-label="Workspace shortcuts">
          {workspaceShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            const isActive = currentView === shortcut.id;

            return (
              <button
                key={shortcut.id}
                type="button"
                className={`nav-workspace-chip ${isActive ? 'active' : ''}`}
                onClick={() => {
                  window.location.hash = shortcut.hash;
                  setShowProfileMenu(false);
                }}
              >
                <Icon size={13} />
                <span>{shortcut.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2nd Card: Navigation Links (MOBILE ONLY, root level child sibling to prevent nested position: fixed inside blur filter) */}
      {isMobile && (
        <nav className="nav-card nav-card--nav mobile-bottom-nav" aria-label="Media categories">
          {categories.map((category) => {
            const Icon = categoryIcons[category.id] || Film;
            const isActive = category.id === selectedCategory && currentView === 'library';

            return (
              <button
                key={category.id}
                type="button"
                className={`nav-pill ${isActive ? 'active' : ''}`}
                onClick={() => handleCategorySelect(category.id)}
              >
                <Icon size={20} />
                <span className="nav-pill-text">{category.name}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
};
