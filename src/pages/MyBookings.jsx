import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { TrashIcon, QRIcon } from '../components/Icons';

const MyBookings = () => {
  const { apiCall } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState(null); // { date, hour, qrCode }
  const [alert, setAlert] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const fetchBookings = async () => {
    try {
      const res = await apiCall('/bookings/me');
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this slot booking? This cannot be undone.')) {
      return;
    }

    setCancellingId(bookingId);
    try {
      const res = await apiCall(`/bookings/${bookingId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showAlert('success', 'Booking cancelled successfully. Slot freed.');
        fetchBookings();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to cancel booking');
      }
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const formatHourString = (hr) => {
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const dispHr = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    const nextHr = hr + 1;
    const nextAmPm = nextHr >= 12 ? 'PM' : 'AM';
    const dispNextHr = nextHr > 12 ? nextHr - 12 : nextHr === 0 ? 12 : nextHr;
    return `${dispHr}:00 ${ampm} - ${dispNextHr}:00 ${nextAmPm}`;
  };

  const getStatusBadge = (booking) => {
    if (booking.checkedIn) {
      return <span className="badge badge-success">Checked In</span>;
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    const currentHour = new Date().getHours();

    if (booking.date < todayStr || (booking.date === todayStr && booking.hour < currentHour)) {
      return <span className="badge badge-danger" style={{ background: 'rgba(107, 114, 128, 0.1)', color: 'var(--color-text-muted)', borderColor: 'rgba(107, 114, 128, 0.3)' }}>Expired</span>;
    }

    return <span className="badge badge-warning" style={{ color: 'var(--color-accent)', borderColor: 'rgba(34, 211, 238, 0.3)', background: 'rgba(34, 211, 238, 0.05)' }}>Upcoming</span>;
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: '800px' }}>
      {alert && (
        <div className={`alert-toast ${alert.type}`} style={{ position: 'fixed', top: '100px', right: '20px', zIndex: 9999 }}>
          <span>{alert.message}</span>
        </div>
      )}

      <div style={{ marginBottom: '30px' }}>
        <h2>My Reserved Sessions</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Enlarge the QR pass thumbnail to present to the entrance scanner before check-in.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <div className="animate-pulse" style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Retrieving reservations...</div>
        </div>
      ) : bookings.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <QRIcon style={{ width: '48px', height: '48px', color: 'var(--color-text-dim)', marginBottom: '16px' }} />
          <h3 style={{ marginBottom: '6px' }}>No Sessions Reserved</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
            Book an hourly training block from the Slots Dashboard to start your workouts.
          </p>
        </div>
      ) : (
        <div className="bookings-list">
          {bookings.map((booking) => {
            const isPast = booking.date < new Date().toLocaleDateString('en-CA');
            const isToday = booking.date === new Date().toLocaleDateString('en-CA');
            const currentHour = new Date().getHours();
            const isExpired = isPast || (isToday && booking.hour < currentHour);

            return (
              <div key={booking._id} className="glass-panel ticket">
                <div className="ticket-details">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '1.25rem' }}>{formatHourString(booking.hour)}</h3>
                    {getStatusBadge(booking)}
                  </div>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                    {new Date(booking.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                    Booking ID: {booking._id}
                  </span>
                </div>

                <div className="ticket-qr-section">
                  {booking.qrCode && !booking.checkedIn && !isExpired && (
                    <img
                      className="qr-thumbnail"
                      src={booking.qrCode}
                      alt="Thumbnail Pass"
                      onClick={() => setQrModal(booking)}
                      title="Enlarge Entry Pass"
                    />
                  )}

                  {!booking.checkedIn && !isExpired && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '10px', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--color-danger)' }}
                      onClick={() => handleCancelBooking(booking._id)}
                      disabled={cancellingId === booking._id}
                      title="Cancel Booking"
                    >
                      <TrashIcon size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ENLARGED QR CODE MODAL OVERLAY */}
      {qrModal && (
        <div className="modal-overlay" onClick={() => setQrModal(null)}>
          <div className="glass-panel modal-content" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '8px' }}>Gym Entrance Pass</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Present this code at the sports facility entrance scanner.
            </p>

            <div style={{
              background: '#ffffff',
              padding: '16px',
              borderRadius: '12px',
              display: 'inline-block',
              marginBottom: '20px',
              boxShadow: '0 0 25px rgba(168, 85, 247, 0.25)'
            }}>
              <img
                src={qrModal.qrCode}
                alt="Enlarged QR Pass"
                style={{ width: '250px', height: '250px', display: 'block' }}
              />
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border-glass)',
              marginBottom: '24px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Date:</span>
                <strong>{new Date(qrModal.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Time Block:</span>
                <strong>{formatHourString(qrModal.hour)}</strong>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setQrModal(null)}
            >
              Close Pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;
