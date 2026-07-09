import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOutIcon, CalendarIcon, QRIcon, CameraIcon } from './Icons';

const Navbar = ({ currentTab, setCurrentTab }) => {
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
