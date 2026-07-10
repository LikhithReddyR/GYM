import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { TrashIcon, QRIcon } from '../components/Icons';
import { useToast } from '../components/Toast';

const MyBookingsSkeleton = () => {
  return (
    <div className="bookings-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="glass-panel ticket" style={{ height: '120px', display: 'flex', justifyContent: 'space-between', padding: '20px' }}>
          <div style={{ width: '70%' }}>
            <div className="skeleton" style={{ height: '24px', width: '50%', marginBottom: '10px' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '30%', marginBottom: '10px' }}></div>
            <div className="skeleton" style={{ height: '12px', width: '40%' }}></div>
          </div>
          <div style={{ width: '20%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div className="skeleton" style={{ height: '50px', width: '50px', borderRadius: '8px' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const BookingCountdown = ({ date, hour }) => {
  const [text, setText] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      // Target start date/time (15 min before the slot hour)
      const targetStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
      targetStart.setMinutes(targetStart.getMinutes() - 15);

      // Target end date/time (the end of the slot hour)
      const targetEnd = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
      targetEnd.setMinutes(targetEnd.getMinutes() + 60);

      const diffStart = targetStart - now;
      const diffEnd = targetEnd - now;

      if (diffEnd <= 0) {
        setText('Expired');
        return;
      }

      if (diffStart > 0) {
        // Entry opens in Xm
        const minutes = Math.floor(diffStart / 60000);
        const seconds = Math.floor((diffStart % 60000) / 1000);
        
        let displayStr = '';
        if (minutes > 60) {
          const hours = Math.floor(minutes / 60);
          displayStr = `${hours}h ${minutes % 60}m`;
        } else {
          displayStr = `${minutes}m ${seconds}s`;
        }
        setText(`Entry opens in ${displayStr}`);
      } else {
        // Entry closes in Xm
        const minutes = Math.floor(diffEnd / 60000);
        const seconds = Math.floor((diffEnd % 60000) / 1000);
        setText(`Entry closes in ${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [date, hour]);

  return (
    <div style={{
      fontSize: '0.8rem',
      fontWeight: '600',
      color: text.includes('closes') ? 'var(--color-success)' : text.includes('opens') ? 'var(--color-warning)' : 'var(--color-text-dim)',
      marginTop: '6px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px'
    }}>
      ⏱️ {text}
    </div>
  );
};

const MyBookings = () => {
  const { user, apiCall } = useAuth();
  const toast = useToast();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState(null); // { date, hour, qrCode, _id }
  const [cancellingId, setCancellingId] = useState(null);

  // Pull-to-refresh state
  const [touchStart, setTouchStart] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
        toast.success('Booking cancelled successfully. Slot freed.');
        fetchBookings();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to cancel booking');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  // Touch handlers for pull-to-refresh
  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      setTouchStart(e.targetTouches[0].clientY);
    }
  };

  const handleTouchMove = async (e) => {
    if (touchStart === null || refreshing) return;
    const currentY = e.targetTouches[0].clientY;
    const diff = currentY - touchStart;

    if (diff > 120) {
      setRefreshing(true);
      setTouchStart(null);
      try {
        await fetchBookings();
        toast.success('Reservations synchronized!');
      } catch (err) {
        toast.error('Sync failed');
      } finally {
        setRefreshing(false);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
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
    <div 
      className="dashboard-container" 
      style={{ maxWidth: '800px' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {refreshing && (
        <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 600 }} className="animate-pulse">
          Refreshing workouts data...
        </div>
      )}

      <div style={{ marginBottom: '30px' }}>
        <h2>My Reserved Sessions</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Enlarge the QR pass thumbnail to present to the entrance scanner before check-in.
        </p>
      </div>

      {loading ? (
        <MyBookingsSkeleton />
      ) : bookings.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-icon">🎟️</div>
          <h3 className="empty-state-title">No Sessions Reserved</h3>
          <p className="empty-state-desc">You don't have any gym slot bookings scheduled. Book a spot from the Slots Dashboard to start training.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Explore Slots
          </button>
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
                  
                  {!booking.checkedIn && !isExpired && (
                    <BookingCountdown date={booking.date} hour={booking.hour} />
                  )}

                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '6px' }}>
                    Booking ID: {booking._id}
                  </div>
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

      {/* ENLARGED TICKET QR CODE MODAL OVERLAY */}
      {qrModal && (
        <div className="modal-overlay" onClick={() => setQrModal(null)}>
          <div className="modal-content ticket-container" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-pass">
              <div className="ticket-header">
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.1em', opacity: 0.9 }}>OFFICIAL ACCESS TICKET</div>
                <h2>GIGAGYM FACILITIES</h2>
              </div>
              
              <div className="ticket-body">
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATTENDEE</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--color-text-main)', marginBottom: '14px' }}>{user ? user.name : 'Facility Member'}</strong>
                
                <div style={{ fontSize: '1.65rem', fontWeight: '800', fontFamily: 'var(--font-title)', color: 'var(--color-primary)', lineHeight: 1.1, textAlign: 'center' }}>
                  {formatHourString(qrModal.hour)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px', fontWeight: 500, textAlign: 'center' }}>
                  {new Date(qrModal.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                
                <BookingCountdown date={qrModal.date} hour={qrModal.hour} />

                {/* Perforation Line */}
                <div className="ticket-perforation" style={{ width: 'calc(100% + 48px)', margin: '20px -24px' }}>
                  <div className="ticket-divider"></div>
                </div>

                <div style={{
                  background: '#ffffff',
                  padding: '12px',
                  borderRadius: '12px',
                  display: 'inline-block',
                  boxShadow: '0 0 25px rgba(168, 85, 247, 0.15)'
                }}>
                  <img
                    src={qrModal.qrCode}
                    alt="Enlarged QR Pass"
                    style={{ width: '210px', height: '210px', display: 'block' }}
                  />
                </div>
                
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginTop: '16px', wordBreak: 'break-all', maxWidth: '85%', textAlign: 'center' }}>
                  TICKET SIGNATURE: {qrModal._id}
                </div>
              </div>
            </div>

            <button
              className="btn btn-secondary"
              style={{ width: '100%', maxWidth: '400px', marginTop: '15px' }}
              onClick={() => setQrModal(null)}
            >
              Close Ticket View
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;
