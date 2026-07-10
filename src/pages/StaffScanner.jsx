import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { CameraIcon, CheckIcon, ClockIcon } from '../components/Icons';

const StaffScanner = () => {
  const { apiCall } = useAuth();
  const [scanMode, setScanMode] = useState('camera'); // 'camera' | 'simulator'
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { success: boolean, message: string, user: {}, booking: {} }
  const [activeBookingsList, setActiveBookingsList] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [scanAnimation, setScanAnimation] = useState(''); // 'scanning' | 'success' | 'error' | ''
  const [alert, setAlert] = useState(null);

  const isScanningRef = useRef(false);

  const handleScanAgain = () => {
    setScanResult(null);
    setScanAnimation('');
    setManualToken('');
    isScanningRef.current = false;
  };

  // Fetch pending check-ins for the day (for ease of testing check-in flow!)
  const fetchAllBookingsForToday = async () => {
    try {
      // In a real app we might fetch all bookings, but here we can make a query
      // or we can fetch a helper list. Let's make an endpoint helper, or just list user's bookings.
      // We can fetch from GET /api/bookings/me, or write a quick general endpoint if admin/staff,
      // but let's query all bookings for today to show in the list.
      // Wait, let's look at what bookings we have. Let's create an endpoint on backend or fetch from all.
      // Since staff are authenticated, we can fetch all bookings or just use a helper.
      // Let's implement a backend route on `/bookings/verify` or similar, or just fetch all bookings.
      // Let's call `/bookings/me` but wait, this gets the current logged-in staff's bookings.
      // What if we just fetch from `/slots` to find bookings, or fetch a general bookings list?
      // Ah! We can write an endpoint in `bookings.js` for staff to fetch today's bookings:
      // Let's verify if we need it. Yes! Let's let staff retrieve today's bookings list to easily scan them.
      // Let's write a backend endpoint: `GET /api/bookings` (Staff only) to list all bookings.
      // Wait! Let's check if we can add `GET /api/bookings` in `server/src/routes/bookings.js` so staff can fetch it.
      // Let's do that! That is very clean.
      // But for now, let's write `StaffScanner.jsx` and then add that endpoint to the backend.
      const res = await apiCall('/bookings/me'); // fallback if no other endpoint
      if (res.ok) {
        const data = await res.json();
        // Filter those that are not checked in yet and are for today
        const todayStr = new Date().toLocaleDateString('en-CA');
        const pending = data.filter(b => b.date === todayStr && !b.checkedIn);
        // Wait, bookings/me only returns the logged-in user's bookings.
        // Let's make a request to GET /api/bookings (which we will add for staff shortly).
        // Let's fetch from /api/bookings if staff, else bookings/me.
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStaffPendingList = async () => {
    setLoadingActive(true);
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const res = await apiCall(`/bookings/all?date=${todayStr}`);
      if (res.ok) {
        const data = await res.json();
        setActiveBookingsList(data);
      }
    } catch (error) {
      console.error('Error loading active bookings list for staff:', error);
    } finally {
      setLoadingActive(false);
    }
  };

  useEffect(() => {
    fetchStaffPendingList();
  }, []);

  const handleVerifyToken = async (tokenToVerify) => {
    if (!tokenToVerify) {
      showAlert('error', 'Please enter or scan a valid token');
      return;
    }

    setVerifying(true);
    setScanResult(null);
    setScanAnimation('scanning');

    // Simulate 1s scan laser delay for beautiful UX
    setTimeout(async () => {
      try {
        const res = await apiCall('/bookings/verify', {
          method: 'POST',
          body: JSON.stringify({ qrToken: tokenToVerify })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setScanResult({
            success: true,
            message: data.message,
            user: data.user,
            booking: data.booking
          });
          setScanAnimation('success');
          showAlert('success', 'Access Granted: Check-in complete!');
          fetchStaffPendingList();
        } else {
          setScanResult({
            success: false,
            message: data.message || 'Verification failed. Pass is invalid.'
          });
          setScanAnimation('error');
          showAlert('error', data.message || 'Verification failed');
        }
      } catch (err) {
        setScanResult({
          success: false,
          message: err.message || 'Connection error checking token'
        });
        setScanAnimation('error');
        showAlert('error', err.message || 'Connection error');
      } finally {
        setVerifying(false);
      }
    }, 1200);
  };

  // Helper trigger to auto-fill booking token and run scanning simulator
  const handleAutoScanBooking = (fullBookingToken) => {
    setManualToken(fullBookingToken);
    handleVerifyToken(fullBookingToken);
  };

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  // Mount real HTML5 camera scanner
  useEffect(() => {
    let scanner = null;
    if (scanMode === 'camera' && !scanResult && !verifying) {
      isScanningRef.current = false;
      const timer = setTimeout(() => {
        try {
          scanner = new Html5QrcodeScanner('qr-reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true
          }, false);

          scanner.render(
            async (decodedText) => {
              if (isScanningRef.current) return;
              isScanningRef.current = true;
              setManualToken(decodedText);
              await handleVerifyToken(decodedText);
            },
            (error) => {
              // ignore scan failures (e.g. no code in frame)
            }
          );
        } catch (err) {
          console.error('Failed to start camera scanner:', err);
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scanner) {
          scanner.clear().catch(err => console.error('Error stopping scanner:', err));
        }
      };
    }
  }, [scanMode, scanResult, verifying]);

  const formatHourString = (hr) => {
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const dispHr = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    const nextHr = hr + 1;
    const nextAmPm = nextHr >= 12 ? 'PM' : 'AM';
    const dispNextHr = nextHr > 12 ? nextHr - 12 : nextHr === 0 ? 12 : nextHr;
    return `${dispHr}:00 ${ampm} - ${dispNextHr}:00 ${nextAmPm}`;
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: '900px' }}>
      {alert && (
        <div className={`alert-toast ${alert.type}`} style={{ position: 'fixed', top: '100px', right: '20px', zIndex: 9999 }}>
          <span>{alert.message}</span>
        </div>
      )}

      <div className="grid-cols-2">
        {/* Left Column: Camera Scanner and Simulator */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ marginBottom: '8px' }}>Gym Entry Terminal</h2>
          
          {/* Scanner Mode Switcher */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', marginBottom: '20px' }}>
            <button 
              className={`btn ${scanMode === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flexGrow: 1, padding: '8px 12px', fontSize: '0.85rem' }}
              onClick={() => setScanMode('camera')}
            >
              Camera Live Scanner
            </button>
            <button 
              className={`btn ${scanMode === 'simulator' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flexGrow: 1, padding: '8px 12px', fontSize: '0.85rem' }}
              onClick={() => setScanMode('simulator')}
            >
              Simulate Scan Feed
            </button>
          </div>

          {scanResult ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="glass-card" style={{
                marginBottom: '24px',
                padding: '20px',
                textAlign: 'left',
                borderLeft: `5px solid ${scanResult.success ? 'var(--color-success)' : 'var(--color-danger)'}`
              }}>
                <h3 style={{ color: scanResult.success ? 'var(--color-success)' : 'var(--color-danger)', marginBottom: '8px' }}>
                  {scanResult.success ? 'Access Granted' : 'Access Denied'}
                </h3>
                <p style={{ fontSize: '0.95rem', marginBottom: '8px', fontWeight: 500 }}>
                  {scanResult.message}
                </p>
                
                {scanResult.success && scanResult.user && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px' }}>
                    <div>Attendee: <strong>{scanResult.user.name}</strong></div>
                    <div>Email: {scanResult.user.email}</div>
                    <div style={{ marginTop: '4px' }}>
                      Slot: <strong>{formatHourString(scanResult.booking.hour)}</strong> ({scanResult.booking.date})
                    </div>
                  </div>
                )}
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px' }}
                onClick={handleScanAgain}
              >
                Scan Next Pass
              </button>
            </div>
          ) : (
            <>
              {scanMode === 'camera' ? (
                <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
                  <div id="qr-reader" style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}></div>
                </div>
              ) : (
                <div className={`scanner-feed ${
                  scanAnimation === 'success' ? 'success-pulse' : 
                  scanAnimation === 'error' ? 'error-pulse' : ''
                }`} style={{ marginBottom: '24px' }}>
                  {scanAnimation === 'scanning' && <div className="scanner-laser"></div>}
                  
                  <div className="scanner-target-box" style={{
                    borderColor: scanAnimation === 'success' ? 'var(--color-success)' :
                                 scanAnimation === 'error' ? 'var(--color-danger)' : 'rgba(255, 255, 255, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <CameraIcon style={{
                      width: '48px',
                      height: '48px',
                      color: scanAnimation === 'success' ? 'var(--color-success)' :
                             scanAnimation === 'error' ? 'var(--color-danger)' : 'var(--color-text-dim)'
                    }} />
                  </div>

                  <div style={{ position: 'absolute', bottom: '15px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {scanAnimation === 'scanning' ? 'Scanning Token Signature...' :
                     scanAnimation === 'success' ? 'CHECK-IN CONFIRMED ✔' :
                     scanAnimation === 'error' ? 'ACCESS DENIED ✘' : 'Simulator Idle — Ready to Scan'}
                  </div>
                </div>
              )}

              <div className="scanner-manual-input">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Paste JWT pass token here..."
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  disabled={verifying}
                />
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleVerifyToken(manualToken)}
                  disabled={verifying}
                >
                  {verifying ? 'Verifying...' : 'Submit'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Testing helper panel */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ marginBottom: '10px' }}>Active Bookings Helper</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
            Testing shortcut: Real-time bookings created for today are listed here. Click "Auto-Scan & Check In" to trigger the scanning flow.
          </p>

          {loadingActive ? (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '40px 0' }}>
              <span>Loading current bookings...</span>
            </div>
          ) : activeBookingsList.length === 0 ? (
            <div style={{ color: 'var(--color-text-dim)', textAlign: 'center', padding: '40px 0', border: '1px dashed var(--border-glass)', borderRadius: '8px' }}>
              <span>No bookings made for today yet. Use a user account to book a slot first!</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeBookingsList.map((booking) => (
                <div key={booking._id} className="glass-card" style={{ 
                  padding: '16px', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  border: booking.checkedIn ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-glass)'
                }}>
                  <div>
                    <h4 style={{ fontSize: '0.95rem' }}>{formatHourString(booking.hour)}</h4>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-accent)', fontWeight: 500, margin: '2px 0' }}>
                      {booking.userId ? booking.userId.name : 'Gym Member'}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                      Booking ID: {booking._id}
                    </span>
                  </div>
                  <div>
                    {booking.checkedIn ? (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckIcon size={12} />
                        Checked In
                      </span>
                    ) : (
                      // We need to fetch the real booking tokens. Wait, the GET /api/bookings/me route returns bookings.
                      // How does staff get the token of this booking?
                      // If we are testing with the same user, the bookings list contains their own qrToken? No,
                      // let's make sure that for testing ease, we can store the qrToken in the frontend list, or fetch it.
                      // Wait! The GET /api/bookings/me list returns `{ _id, date, hour, checkedIn, qrCode, qrToken }` (or similar)
                      // wait, in the routes file, bookings/me returned `{ _id, slotId, date, hour, checkedIn, qrCode }`, and does NOT include the raw `qrToken`.
                      // Oh! If it doesn't include the raw `qrToken`, how can we copy-paste it?
                      // Ah, we can modify the backend to include `qrToken` in the response of `GET /api/bookings/me` so that users and staff can easily see the token for manual scanning testing! This is an excellent addition for testing and debugging.
                      // Wait, did we return `qrToken` in `GET /api/bookings/me`? Let's check `routes/bookings.js`.
                      // In `routes/bookings.js` lines 18-29:
                      // `return { _id: booking._id, slotId: booking.slotId, date: booking.date, hour: booking.hour, timestamp: booking.timestamp, checkedIn: booking.checkedIn, qrCode };`
                      // It omitted `qrToken`!
                      // Let's modify `routes/bookings.js` to also return `qrToken: booking.qrToken`.
                      // Then we can display the token in the My Bookings page and retrieve it in the staff helper list. That will make testing 100x easier!
                      // Let's write the staff scanner, and then we will update the bookings route to include `qrToken`.
                      // In this staff list, if the booking does not show a test token, we can just say "Please copy token from My Bookings".
                      // Wait, let's make sure we show a button "Scan & Verify" that uses the token. To do this, let's fetch the list of bookings with their tokens.
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          // If we have booking.qrToken (which we will add), we pass it.
                          // If we don't, we can show a placeholder or let the user copy it.
                          if (booking.qrToken) {
                            handleAutoScanBooking(booking.qrToken);
                          } else {
                            // If we don't have it, let's fetch from localStorage or alert
                            // We will update the route to return `qrToken` so it will definitely be present!
                            showAlert('info', 'Updating token database...');
                          }
                        }}
                      >
                        Auto-Scan Pass
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffScanner;
