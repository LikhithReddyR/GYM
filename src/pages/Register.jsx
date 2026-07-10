import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyIcon } from '../components/Icons';

const Register = ({ onToggleLogin }) => {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staffSecret, setStaffSecret] = useState('');
  const [showStaffField, setShowStaffField] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(name, email, password, showStaffField ? staffSecret : '');
    } catch (err) {
      setError(err.message || 'Registration failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="glass-panel auth-card">
        <div className="auth-header">
          <h1>Get Started</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
            Register to join the club and book slots
          </p>
        </div>

        {error && (
          <div className="alert-toast error">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input
              type="email"
              className="input-field"
              placeholder="e.g. john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--color-text-muted)'
              }}
            >
              <input
                type="checkbox"
                checked={showStaffField}
                onChange={(e) => setShowStaffField(e.target.checked)}
              />
              <span>Register as Gym Staff / Admin</span>
            </label>
          </div>

          {showStaffField && (
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <KeyIcon size={14} style={{ color: 'var(--color-warning)' }} />
                <span>Staff Secret Code</span>
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="Enter staff activation secret"
                value={staffSecret}
                onChange={(e) => setStaffSecret(e.target.value)}
                required={showStaffField}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                For local testing use: <code style={{ color: '#ffffff' }}>GymStaffSecret2026</code>
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-warning)', marginTop: '4px' }}>
                Note: This code is only for registering your account. Once registered, log in using your Email Address and Password.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '10px' }}
            disabled={submitting}
          >
            {submitting ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Already registered? </span>
          <a href="#" className="auth-link" onClick={(e) => { e.preventDefault(); onToggleLogin(); }}>
            Sign In here
          </a>
        </div>
      </div>
    </div>
  );
};

export default Register;
