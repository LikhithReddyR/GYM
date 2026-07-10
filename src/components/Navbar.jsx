import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOutIcon, CalendarIcon, QRIcon, CameraIcon } from './Icons';

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
);

const Navbar = ({ currentTab, setCurrentTab, theme, setTheme }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => setCurrentTab('dashboard')}>
        <CalendarIcon style={{ strokeWidth: 3 }} />
        <span>GigaGym Bookings</span>
      </div>

      <div className="nav-links">
        {user.role === 'user' && (
          <>
            <div
              className={`nav-link ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentTab('dashboard')}
            >
              Slots Dashboard
            </div>
            <div
              className={`nav-link ${currentTab === 'bookings' ? 'active' : ''}`}
              onClick={() => setCurrentTab('bookings')}
            >
              My Bookings
            </div>
          </>
        )}

        {(user.role === 'staff' || user.role === 'admin') && (
          <div
            className={`nav-link ${currentTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setCurrentTab('scanner')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <CameraIcon size={16} />
            Staff Scanner View
          </div>
        )}

        {user.role === 'admin' && (
          <div
            className={`nav-link ${currentTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setCurrentTab('analytics')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            Admin Analytics
          </div>
        )}

        <button
          className="theme-toggle-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="user-tag" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{user.name}</span>
          <span className="badge badge-success" style={{ padding: '2px 8px', fontSize: '0.65rem' }}>
            {user.role.toUpperCase()}
          </span>
        </div>

        <button className="btn btn-secondary" onClick={logout} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
          <LogOutIcon size={16} />
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
