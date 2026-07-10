import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MyBookings from './pages/MyBookings';
import StaffScanner from './pages/StaffScanner';
import AdminAnalytics from './pages/AdminAnalytics';
import { ToastProvider } from './components/Toast';
import './App.css';

const MainAppContent = () => {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Handle HTML data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Handle default views on user login
  useEffect(() => {
    if (user) {
      if (user.role === 'staff' || user.role === 'admin') {
        setCurrentTab('scanner');
      } else {
        setCurrentTab('dashboard');
      }
    }
  }, [user]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--color-text-muted)'
      }}>
        <div className="animate-pulse" style={{ fontSize: '1.5rem', fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--color-primary)' }}>
          GigaGym Bookings
        </div>
        <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>Connecting to facility network...</p>
      </div>
    );
  }

  // Not authenticated flow
  if (!user) {
    return showRegister ? (
      <Register onToggleLogin={() => setShowRegister(false)} />
    ) : (
      <Login onToggleRegister={() => setShowRegister(true)} />
    );
  }

  // Authenticated flow
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} theme={theme} setTheme={setTheme} />
      
      <main style={{ flexGrow: 1 }}>
        {currentTab === 'dashboard' && user.role === 'user' && <Dashboard />}
        {currentTab === 'bookings' && user.role === 'user' && <MyBookings />}
        {currentTab === 'scanner' && (user.role === 'staff' || user.role === 'admin') && <StaffScanner />}
        {currentTab === 'analytics' && user.role === 'admin' && <AdminAnalytics />}
      </main>

      <footer style={{
        padding: '30px 20px',
        textAlign: 'center',
        borderTop: '1px solid var(--border-glass)',
        color: 'var(--color-text-dim)',
        fontSize: '0.85rem',
        marginTop: 'auto',
        background: 'rgba(15, 22, 36, 0.4)'
      }}>
        © 2026 GigaGym Sports Facility. Institutional Slot Allocation System. Gated Verification Protocol.
      </footer>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainAppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
