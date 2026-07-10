import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { CameraIcon, CheckIcon, ClockIcon } from '../components/Icons';
import { useToast } from '../components/Toast';

const StaffScannerSkeleton = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-card" style={{ height: '80px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: '60%' }}>
            <div className="skeleton" style={{ height: '18px', width: '40%', marginBottom: '6px' }}></div>
            <div className="skeleton" style={{ height: '14px', width: '60%' }}></div>
          </div>
          <div className="skeleton" style={{ height: '32px', width: '80px', borderRadius: '6px' }}></div>
        </div>
      ))}
    </div>
  );
};

const StaffScanner = () => {
  const { apiCall } = useAuth();
  const toast = useToast();
  const [scanMode, setScanMode] = useState('camera'); // 'camera' | 'simulator'
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { success: boolean, message: string, user: {}, booking: {} }
  const [activeBookingsList, setActiveBookingsList] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [scanAnimation, setScanAnimation] = useState(''); // 'scanning' | 'success' | 'error' | ''

  const isScanningRef = useRef(false);

  const handleScanAgain = () => {
    setScanResult(null);
    setScanAnimation('');
    setManualToken('');
    isScanningRef.current = false;
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
      toast.error('Please enter or scan a valid token');
      return;
    }

    setVerifying(true);
    setScanResult(null);
    setScanAnimation('scanning');

    // Simulate 1.2s scan laser delay for beautiful UX
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
          toast.success('Access Granted: Check-in complete!');
          fetchStaffPendingList();
        } else {
          setScanResult({
            success: false,
            message: data.message || 'Verification failed. Pass is invalid.'
          });
          setScanAnimation('error');
          toast.error(data.message || 'Verification failed');
        }
      } catch (err) {
        setScanResult({
          success: false,
          message: err.message || 'Connection error checking token'
        });
        setScanAnimation('error');
        toast.error(err.message || 'Connection error');
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
              // ignore scan failures
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
      
      {/* FULLSCREEN SCAN RESULT OVERLAYS */}
      {scanResult && (
        <div className={`fullscreen-overlay ${scanResult.success ? 'success' : 'error'}`}>
          <div className={`fullscreen-icon-circle ${scanResult.success ? 'success' : 'error'}`}>
            {scanResult.success ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            )}
          </div>
          
          <h1 className="fullscreen-title">
            {scanResult.success ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
          </h1>
          <p className="fullscreen-message">
            {scanResult.message}
          </p>
          
          {scanResult.success && scanResult.user && (
            <div style={{
              fontSize: '1.2rem',
              background: 'rgba(0,0,0,0.15)',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '30px',
              maxWidth: '500px',
              textAlign: 'left'
            }}>
              <div>Attendee: <strong>{scanResult.user.name}</strong></div>
              <div>Email: {scanResult.user.email}</div>
              <div style={{ marginTop: '8px' }}>
                Slot: <strong>{formatHourString(scanResult.booking.hour)}</strong> ({scanResult.booking.date})
              </div>
            </div>
          )}

          <button className="fullscreen-btn" onClick={handleScanAgain}>
            Scan Next Pass
          </button>
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
            <StaffScannerSkeleton />
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
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          if (booking.qrToken) {
                            handleAutoScanBooking(booking.qrToken);
                          } else {
                            toast.info('Wait, token not loaded. Refreshing...');
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
