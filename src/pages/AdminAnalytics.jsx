import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const AdminAnalyticsSkeleton = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div className="glass-panel" style={{ padding: '30px', height: '140px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: '40%' }}><div className="skeleton" style={{ height: '36px', width: '80%', marginBottom: '10px' }}></div><div className="skeleton" style={{ height: '18px', width: '50%' }}></div></div>
        <div className="skeleton" style={{ height: '60px', width: '200px', borderRadius: '8px' }}></div>
      </div>
      <div className="grid-cols-2">
        <div className="glass-panel" style={{ padding: '30px', height: '350px' }}>
          <div className="skeleton" style={{ height: '24px', width: '60%', marginBottom: '24px' }}></div>
          <div className="skeleton" style={{ height: '220px', width: '100%', borderRadius: '12px' }}></div>
        </div>
        <div className="glass-panel" style={{ padding: '30px', height: '350px' }}>
          <div className="skeleton" style={{ height: '24px', width: '60%', marginBottom: '24px' }}></div>
          <div className="skeleton" style={{ height: '220px', width: '100%', borderRadius: '12px' }}></div>
        </div>
      </div>
      <div className="glass-panel" style={{ padding: '30px', height: '400px' }}>
        <div className="skeleton" style={{ height: '24px', width: '40%', marginBottom: '24px' }}></div>
        <div className="skeleton" style={{ height: '260px', width: '100%', borderRadius: '12px' }}></div>
      </div>
    </div>
  );
};

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#a855f7'];

const AdminAnalytics = () => {
  const { user, apiCall } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetchAnalytics = async () => {
    try {
      const res = await apiCall('/membership/analytics');
      if (res.ok) {
        const stats = await res.json();
        setData(stats);
      } else {
        toast.error('Failed to retrieve analytics data');
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Connection issue fetching analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchAnalytics();
    }
  }, [user]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="dashboard-container" style={{ textAlign: 'center', padding: '100px 20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🚫</div>
        <h2>Access Restricted</h2>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '8px' }}>Only facility administrators hold credentials to review statistical performance analytics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <AdminAnalyticsSkeleton />
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div style={{ marginBottom: '30px' }}>
        <span className="badge badge-success" style={{ marginBottom: '10px' }}>Console Mode</span>
        <h2>Admin Overview Dashboard</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>Institutional facility statistics, revenue graphs, and peak gym check-in loads.</p>
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Revenue Panel Summary Card */}
          <div className="glass-panel" style={{ padding: '24px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <span className="input-label" style={{ color: 'var(--color-primary)' }}>Total System Revenue</span>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: '4px' }}>₹{data.totalRevenue.toLocaleString()}</h2>
            </div>
            <div style={{ display: 'flex', gap: '24px' }}>
              {data.revenue.map((r, i) => (
                <div key={i} style={{ borderLeft: '3px solid var(--color-secondary)', paddingLeft: '12px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{r.name}</div>
                  <strong style={{ fontSize: '1.1rem', color: '#ffffff' }}>₹{r.value.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="grid-cols-2">
            {/* Membership Type Breakdowns */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Membership Status Breakdowns</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.memberships}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {data.memberships.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1f2937', borderColor: 'var(--border-glass)', color: '#ffffff' }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Plan Category Revenue Breakdown */}
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Plan Revenue Distribution</h3>
              <div style={{ height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={11} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#1f2937', borderColor: 'var(--border-glass)', color: '#ffffff' }} />
                    <Bar dataKey="value" name="Revenue (₹)" fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
                      {data.revenue.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Peak Attendance Hours Heatmap */}
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '10px', fontSize: '1.2rem' }}>Peak Slot Attendance Load Chart</h3>
            <p style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem', marginBottom: '24px' }}>Total slot bookings distributed across operating hours (6:00 AM to 9:00 PM).</p>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.peakHours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={10} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#1f2937', borderColor: 'var(--border-glass)', color: '#ffffff' }} />
                  <Bar dataKey="bookings" name="Booked Count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default AdminAnalytics;
