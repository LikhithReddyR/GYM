import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { CalendarIcon, ClockIcon, ZapIcon, CheckIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
import { io } from 'socket.io-client';

const DashboardSkeleton = () => {
  return (
    <div className="slots-grid">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="glass-card slot-card" style={{ padding: '20px', minHeight: '160px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="skeleton" style={{ height: '24px', width: '60%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '80%' }}></div>
          <div className="skeleton" style={{ height: '6px', width: '100%', borderRadius: '3px' }}></div>
          <div className="skeleton" style={{ height: '42px', width: '100%', borderRadius: '8px', marginTop: 'auto' }}></div>
        </div>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const { user, apiCall, token } = useAuth();
  const toast = useToast();
  
  // Date states
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Membership & slots states
  const [membership, setMembership] = useState(null);
  const [slots, setSlots] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [bookingInProgress, setBookingInProgress] = useState(null);

  // UI control states
  const [showPlans, setShowPlans] = useState(false);
  const [paymentModal, setPaymentModal] = useState(null); // { order, plan }
  const [paymentStatus, setPaymentStatus] = useState(''); // 'success' | 'failure' | ''
  const [confirmationModal, setConfirmationModal] = useState(null); // { date, hour, qrCode }

  const pollIntervalRef = useRef(null);

  // Generate next 7 days list starting from today
  const getNext7Days = () => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const yyyyMmDd = d.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      const weekdayStr = d.toLocaleDateString(undefined, { weekday: 'short' });
      const dayNum = d.getDate();
      list.push({ dateStr: yyyyMmDd, weekday: weekdayStr, dayNum });
    }
    return list;
  };

  const fetchMembership = async () => {
    try {
      const res = await apiCall('/membership/me');
      if (res.ok) {
        const data = await res.json();
        setMembership(data);
        if (data.status !== 'active') {
          setShowPlans(true);
        } else {
          setShowPlans(false);
        }
      }
    } catch (error) {
      console.error('Error fetching membership info:', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchSlots = async (dateParam, showSpinner = false) => {
    if (showSpinner) setLoadingSlots(true);
    try {
      const res = await apiCall(`/slots?date=${dateParam}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data);
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const fetchMyBookings = async () => {
    try {
      const res = await apiCall('/bookings/me');
      if (res.ok) {
        const data = await res.json();
        setMyBookings(data);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  // Initial load and selectedDate changes
  useEffect(() => {
    fetchMembership();
    fetchMyBookings();
    fetchSlots(selectedDate, true);

    // Setup periodic polling every 12s as a fallback to keep slot counts live
    pollIntervalRef.current = setInterval(() => {
      fetchSlots(selectedDate, false);
      fetchMyBookings();
    }, 12000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedDate]);

  // Real-time updates via Socket.io
  useEffect(() => {
    // Resolve base socket URL
    let resolvedApiUrl = import.meta.env.VITE_API_BASE_URL || '';
    if (!resolvedApiUrl || resolvedApiUrl.includes('(') || resolvedApiUrl.includes(' ') || resolvedApiUrl === 'undefined') {
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        resolvedApiUrl = 'http://localhost:5000/api';
      } else {
        resolvedApiUrl = '/api';
      }
    }
    const socketUrl = resolvedApiUrl.replace('/api', '') || window.location.origin;

    const socket = io(socketUrl, {
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to real-time updates server');
    });

    socket.on('slotUpdate', (updatedSlot) => {
      if (updatedSlot.date === selectedDate) {
        setSlots(prevSlots =>
          prevSlots.map(s => s._id === updatedSlot._id ? updatedSlot : s)
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedDate, token]);

  // Helper to load Razorpay checkout script
  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Handle plan purchase
  const handlePurchase = async (plan) => {
    try {
      toast.info('Initializing payment checkout...');
      const res = await apiCall('/membership/create-order', {
        method: 'POST',
        body: JSON.stringify({ plan })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Payment initiation failed');
      }

      const order = await res.json();

      if (order.isMock) {
        // Trigger simulated checkout modal
        setPaymentModal({ order, plan });
      } else {
        // Real Razorpay integration
        const loaded = await loadRazorpay();
        if (!loaded) {
          toast.error('Razorpay SDK failed to load. Use mock payment mode instead.');
          return;
        }

        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_mock_id_12345',
          amount: order.amount,
          currency: order.currency,
          name: 'GigaGym Sports Facility',
          description: `Subscription: ${plan.toUpperCase()} Plan`,
          order_id: order.id,
          handler: async (response) => {
            await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan
            });
          },
          prefill: {
            name: user.name,
            email: user.email
          },
          theme: {
            color: '#a855f7'
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      }

    } catch (err) {
      toast.error(err.message);
    }
  };

  // Verify payment endpoint
  const verifyPayment = async (payload) => {
    try {
      const res = await apiCall('/membership/verify-payment', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Payment verification failed');
      }

      toast.success('Payment verified! Membership is now active.');
      fetchMembership();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Simulate Mock Payment Process
  const handleSimulatePayment = async (success) => {
    if (!success) {
      setPaymentStatus('failure');
      setTimeout(() => {
        setPaymentModal(null);
        setPaymentStatus('');
        toast.error('Payment simulated failure. Subscription was not activated.');
      }, 1500);
      return;
    }

    setPaymentStatus('success');
    setTimeout(async () => {
      const payload = {
        razorpay_order_id: paymentModal.order.id,
        razorpay_payment_id: `mock_pay_${Date.now()}`,
        razorpay_signature: 'mock_signature_valid',
        plan: paymentModal.plan,
        isMock: true
      };
      await verifyPayment(payload);
      setPaymentModal(null);
      setPaymentStatus('');
    }, 1500);
  };

  // Handle slot booking (Optimistic Update with friend tagging option)
  const handleBookSlot = async (slotId, hour) => {
    if (!membership || membership.status !== 'active') {
      toast.error('Active membership required to book slots.');
      setShowPlans(true);
      return;
    }

    let friendEmail = null;
    const tagFriend = window.confirm('Would you like to tag a registered friend for this gym slot booking?');
    if (tagFriend) {
      const email = window.prompt("Enter your friend's registered email address:");
      if (email) {
        friendEmail = email.trim();
      } else {
        return;
      }
    }

    // Save previous state for rollback
    const previousSlots = [...slots];
    const previousMyBookings = [...myBookings];

    // Optimistically update
    const increment = friendEmail ? 2 : 1;
    setSlots(prevSlots =>
      prevSlots.map(s =>
        s._id === slotId ? { ...s, bookedCount: Math.min(s.capacity, s.bookedCount + increment) } : s
      )
    );

    const tempBooking = {
      _id: `temp_${Date.now()}`,
      slotId,
      date: selectedDate,
      hour,
      checkedIn: false,
      isTemp: true
    };
    setMyBookings(prev => [tempBooking, ...prev]);
    setBookingInProgress(slotId);

    try {
      const res = await apiCall(`/slots/${slotId}/book`, {
        method: 'POST',
        body: JSON.stringify({ friendEmail })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Booking failed');
      }

      // Show confirmation modal
      setConfirmationModal({
        date: selectedDate,
        hour,
        qrCode: data.qrCode
      });

      toast.success(data.message || 'Slot booked successfully!');
      fetchSlots(selectedDate, false);
      fetchMyBookings();
    } catch (err) {
      // Rollback
      setSlots(previousSlots);
      setMyBookings(previousMyBookings);
      toast.error(err.message);
    } finally {
      setBookingInProgress(null);
    }
  };

  const handleJoinWaitlist = async (slotId) => {
    if (!membership || membership.status !== 'active') {
      toast.error('Active membership required to join waitlists.');
      setShowPlans(true);
      return;
    }

    setBookingInProgress(slotId);
    try {
      const res = await apiCall(`/slots/${slotId}/waitlist`, {
        method: 'POST'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to join waitlist');
      }

      toast.success(data.message || 'Added to waitlist!');
      fetchSlots(selectedDate, false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBookingInProgress(null);
    }
  };

  const formatHourString = (hr) => {
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const dispHr = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    const nextHr = hr + 1;
    const nextAmPm = nextHr >= 12 ? 'PM' : 'AM';
    const dispNextHr = nextHr > 12 ? nextHr - 12 : nextHr === 0 ? 12 : nextHr;
    return `${dispHr}:00 ${ampm} - ${dispNextHr}:00 ${nextAmPm}`;
  };

  const getMembershipColor = (days) => {
    if (days > 7) return 'var(--color-success)';
    if (days >= 3) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  return (
    <div className="dashboard-container">
      {/* 1. Membership Dashboard Section */}
      {loadingMembers ? (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '30px' }}>
          <div className="skeleton" style={{ height: '40px', width: '80%', marginBottom: '10px' }}></div>
          <div className="skeleton" style={{ height: '20px', width: '50%' }}></div>
        </div>
      ) : membership && (
        <div>
          {membership.status === 'active' ? (
            <div className="glass-panel membership-banner" style={{ borderLeft: `6px solid ${getMembershipColor(membership.daysLeft)}` }}>
              <div className="membership-info">
                <span className="input-label" style={{ color: getMembershipColor(membership.daysLeft) }}>
                  Active Gym Pass
                </span>
                <h2>{membership.plan.toUpperCase()} MEMBERSHIP</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  Valid until: {new Date(membership.endDate).toLocaleDateString(undefined, { dateStyle: 'long' })}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div className="days-left-count" style={{ color: getMembershipColor(membership.daysLeft) }}>
                  {membership.daysLeft} <span>Days left</span>
                </div>
                {membership.daysLeft < 7 && (
                  <button className="btn btn-primary" onClick={() => setShowPlans(true)}>
                    Renew Now
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel membership-banner" style={{ borderLeft: '6px solid var(--color-danger)' }}>
              <div className="membership-info">
                <span className="input-label" style={{ color: 'var(--color-danger)' }}>Access Blocked</span>
                <h2>No Active Gym Membership</h2>
                <p style={{ color: 'var(--color-text-muted)' }}>You must hold a membership plan to book training slots.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowPlans(true)}>
                Purchase Membership
              </button>
            </div>
          )}
        </div>
      )}

      {/* User Streak & Workouts Stats Panel */}
      {!loadingMembers && user && user.role === 'user' && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '30px', background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.08) 0%, var(--bg-glass) 100%)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div>
            <span className="input-label" style={{ fontSize: '0.75rem' }}>Personal Streak</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '2rem' }}>🔥</span>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0, color: 'var(--color-warning)' }}>{membership?.userStreakCurrent || 0} Days</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', margin: 0 }}>Max Streak: {membership?.userStreakMax || 0} days</p>
              </div>
            </div>
          </div>
          
          <div>
            <span className="input-label" style={{ fontSize: '0.75rem' }}>Total Workouts</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '2rem' }}>💪</span>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0, color: 'var(--color-primary)' }}>{membership?.userTotalSessions || 0} Sessions</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', margin: 0 }}>Total check-ins logged</p>
              </div>
            </div>
          </div>

          <div>
            <span className="input-label" style={{ fontSize: '0.75rem' }}>Preferred Hour</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '2rem' }}>🕒</span>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: 'var(--color-accent)' }}>
                  {membership?.mostBookedSlot !== undefined && membership?.mostBookedSlot !== null ? formatHourString(membership.mostBookedSlot) : 'No bookings yet'}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', margin: 0 }}>Most-booked time block</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Pricing Grid */}
      {showPlans && (
        <div className="glass-panel" style={{ padding: '30px', marginBottom: '30px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>Select a Membership Plan</h2>
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '30px' }}>
            Get instant access to book up to 1 slot per day. Standard capacity limits enforced.
          </p>
          <div className="plans-grid">
            <div className="glass-card plan-card">
              <span className="plan-title">Monthly</span>
              <div className="plan-price">₹500 <span>/ mo</span></div>
              <ul className="plan-features">
                <li>Hourly gym block bookings</li>
                <li>Instant QR entrance pass</li>
                <li>Free equipment locker access</li>
              </ul>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => handlePurchase('monthly')}>
                Subscribe
              </button>
            </div>

            <div className="glass-card plan-card popular">
              <span className="badge badge-success plan-badge">BEST VALUE</span>
              <span className="plan-title" style={{ color: 'var(--color-primary)' }}>Quarterly</span>
              <div className="plan-price">₹1,300 <span>/ 3 mo</span></div>
              <ul className="plan-features">
                <li>Save 13% vs monthly</li>
                <li>Hourly gym block bookings</li>
                <li>Instant QR entrance pass</li>
                <li>Free equipment locker access</li>
              </ul>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handlePurchase('quarterly')}>
                Subscribe
              </button>
            </div>

            <div className="glass-card plan-card">
              <span className="plan-title">Annual</span>
              <div className="plan-price">₹4,500 <span>/ yr</span></div>
              <ul className="plan-features">
                <li>Save 25% vs monthly</li>
                <li>Hourly gym block bookings</li>
                <li>Instant QR entrance pass</li>
                <li>Free equipment locker access</li>
              </ul>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => handlePurchase('yearly')}>
                Subscribe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Slot Grid & Date Picker Section */}
      <div className="glass-panel" style={{ padding: '30px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2>Gym Training Slots</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '2px' }}>
            Select a date. Capacity is strictly limited to 30 members per hour.
          </p>
        </div>

        {/* Scrollable horizontal date strip */}
        <div className="date-strip-container">
          {getNext7Days().map((item) => (
            <div
              key={item.dateStr}
              className={`date-strip-card ${selectedDate === item.dateStr ? 'active' : ''}`}
              onClick={() => setSelectedDate(item.dateStr)}
            >
              <div className="date-weekday">{item.weekday}</div>
              <div className="date-day">{item.dayNum}</div>
            </div>
          ))}
        </div>

        {loadingSlots ? (
          <DashboardSkeleton />
        ) : slots.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">🏋️‍♂️</div>
            <h3 className="empty-state-title">No Slots Available</h3>
            <p className="empty-state-desc">There are no training blocks seeded for this day.</p>
          </div>
        ) : (
          <div className="slots-grid">
            {slots.map((slot) => {
              const spotsLeft = slot.capacity - slot.bookedCount;
              const isFull = spotsLeft <= 0;
              
              // Check if user has already booked this slot
              const isBookedByUser = myBookings.some(b => b.slotId === slot._id);

              // Percentage of filled slots
              const fillPercentage = (slot.bookedCount / slot.capacity) * 100;
              
              // Color-coding by fill levels
              let capColor = 'green';
              let fillBg = 'var(--color-success)';
              if (isFull) {
                capColor = 'grey';
                fillBg = 'var(--color-text-dim)';
              } else if (fillPercentage >= 80) {
                capColor = 'red';
                fillBg = 'var(--color-danger)';
              } else if (fillPercentage >= 50) {
                capColor = 'amber';
                fillBg = 'var(--color-warning)';
              }

              // Card styling details
              let cardBorder = 'var(--border-glass)';
              let cardBg = 'var(--bg-card)';
              if (isFull) {
                cardBorder = 'rgba(107, 114, 128, 0.2)';
                cardBg = 'rgba(26, 32, 46, 0.4)';
              } else if (isBookedByUser) {
                cardBorder = 'rgba(34, 211, 238, 0.4)';
                cardBg = 'linear-gradient(135deg, rgba(34, 211, 238, 0.05), var(--bg-card))';
              } else if (capColor === 'red') {
                cardBorder = 'rgba(239, 68, 68, 0.25)';
              } else if (capColor === 'amber') {
                cardBorder = 'rgba(245, 158, 11, 0.25)';
              } else {
                cardBorder = 'rgba(16, 185, 129, 0.2)';
              }

              return (
                <div key={slot._id} className={`glass-card slot-card ${isBookedByUser ? 'booked' : ''}`} style={{ borderColor: cardBorder, background: cardBg }}>
                  <div className="slot-time">{formatHourString(slot.hour)}</div>
                  
                  <div className="slot-capacity-info">
                    <div className="slot-capacity-text">
                      <span>Capacity</span>
                      <strong style={{ 
                        color: isFull ? 'var(--color-text-dim)' : 
                               isBookedByUser ? 'var(--color-accent)' : 
                               capColor === 'green' ? 'var(--color-success)' : 
                               capColor === 'amber' ? 'var(--color-warning)' : 'var(--color-danger)'
                      }}>
                        {isFull ? 'FULLY BOOKED' : isBookedByUser ? 'BOOKED BY YOU' : `${slot.bookedCount}/${slot.capacity} booked`}
                      </strong>
                    </div>
                    <div className="slot-capacity-bar">
                      <div 
                        className={`slot-capacity-fill ${capColor}`}
                        style={{ width: `${fillPercentage}%`, backgroundColor: fillBg }}
                      ></div>
                    </div>
                  </div>

                  {isBookedByUser ? (
                    <div 
                      className="btn btn-secondary" 
                      style={{ border: '1px solid rgba(34, 211, 238, 0.4)', color: 'var(--color-accent)', gap: '6px', width: '100%', cursor: 'default' }}
                    >
                      <CheckIcon size={16} />
                      Already Reserved
                    </div>
                  ) : isFull ? (
                    slot.waitlist && slot.waitlist.some(w => w.userId === user._id) ? (
                      <button
                        className="btn btn-secondary"
                        style={{ width: '100%', border: '1px dashed var(--color-warning)', color: 'var(--color-warning)', cursor: 'default' }}
                      >
                        On Waitlist (Position {slot.waitlist.findIndex(w => w.userId === user._id) + 1})
                      </button>
                    ) : (
                      <button
                        className="btn btn-accent"
                        style={{ width: '100%' }}
                        disabled={bookingInProgress !== null}
                        onClick={() => handleJoinWaitlist(slot._id)}
                      >
                        {bookingInProgress === slot._id ? 'Joining Waitlist...' : 'Join Waitlist'}
                      </button>
                    )
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      disabled={bookingInProgress !== null}
                      onClick={() => handleBookSlot(slot._id, slot.hour)}
                    >
                      {bookingInProgress === slot._id ? 'Securing Spot...' : 'Book Spot'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. MOCK PAYMENT MODAL OVERLAY */}
      {paymentModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ border: '2px solid var(--color-primary)' }}>
            <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}>
              <ZapIcon style={{ color: 'var(--color-primary)' }} />
              Simulated Checkout
            </h2>
            <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
              You are subscribing to the <strong style={{ color: '#ffffff' }}>{paymentModal.plan.toUpperCase()}</strong> plan for <strong style={{ color: '#ffffff' }}>₹{paymentModal.order.amount / 100}</strong>.
            </p>

            {paymentStatus === '' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  className="btn btn-primary animate-pulse" 
                  style={{ width: '100%' }}
                  onClick={() => handleSimulatePayment(true)}
                >
                  Simulate Success (Authorise Signature)
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  onClick={() => handleSimulatePayment(false)}
                >
                  Simulate Failure (Decline Card)
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: paymentStatus === 'success' ? 'var(--color-success)' : 'var(--color-danger)'
                }}>
                  {paymentStatus === 'success' ? 'Payment Verified ✔' : 'Declined ✘'}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  {paymentStatus === 'success' ? 'Registering membership profile...' : 'Transaction cancelled.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. BOOKING CONFIRMATION / QR CODE MODAL OVERLAY */}
      {confirmationModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: '8px' }}>Booking Reserved!</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Your entrance pass is ready. Show this QR to staff at the gate.
            </p>
            
            <div style={{
              background: '#ffffff',
              padding: '16px',
              borderRadius: '12px',
              display: 'inline-block',
              marginBottom: '20px',
              boxShadow: '0 0 25px rgba(168, 85, 247, 0.2)'
            }}>
              <img 
                src={confirmationModal.qrCode} 
                alt="Entrance QR Pass" 
                style={{ width: '220px', height: '220px', display: 'block' }}
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
                <strong>{new Date(confirmationModal.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Time Slot:</span>
                <strong>{formatHourString(confirmationModal.hour)}</strong>
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              onClick={() => setConfirmationModal(null)}
            >
              Done, Close Modal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
