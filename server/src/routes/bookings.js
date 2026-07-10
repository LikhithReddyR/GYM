import express from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import rateLimit from 'express-rate-limit';
import Booking from '../models/Booking.js';
import TimeSlot from '../models/TimeSlot.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { protect, isStaff } from '../middleware/auth.js';

const router = express.Router();

// Rate limiting configuration for booking actions
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { message: 'Too many booking requests from this IP. Please try again later.' }
});

// @desc    Get current user's bookings with dynamically generated base64 QRs
// @route   GET /api/bookings/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .sort({ date: -1, hour: -1 });

    const bookingsWithQR = await Promise.all(
      bookings.map(async (booking) => {
        let qrCode = '';
        try {
          qrCode = await QRCode.toDataURL(booking.qrToken);
        } catch (err) {
          console.error('Failed to generate QR code for token:', err);
        }
        return {
          _id: booking._id,
          slotId: booking.slotId,
          date: booking.date,
          hour: booking.hour,
          timestamp: booking.timestamp,
          checkedIn: booking.checkedIn,
          qrCode,
          qrToken: booking.qrToken
        };
      })
    );

    res.json(bookingsWithQR);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ message: 'Server error retrieving bookings' });
  }
});

// @desc    Get all bookings for a date (Staff only, helper for scanner)
// @route   GET /api/bookings/all
// @access  Private (Staff only)
router.get('/all', protect, isStaff, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  try {
    const bookings = await Booking.find({ date: targetDate })
      .populate('userId', 'name email')
      .sort({ hour: 1 });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching all bookings for staff:', error);
    res.status(500).json({ message: 'Server error retrieving bookings' });
  }
});

// @desc    Cancel a booking and free up slot capacity (or promote next waitlisted user)
// @route   DELETE /api/bookings/:id
// @access  Private
router.delete('/:id', protect, bookingLimiter, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Security check: Only the user who booked can cancel it
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized action' });
    }

    if (booking.checkedIn) {
      return res.status(400).json({ message: 'Cannot cancel a booking after check-in' });
    }

    // Remove the booking
    await Booking.deleteOne({ _id: booking._id });

    // Handle waitlist auto-promotion
    const slot = await TimeSlot.findById(booking.slotId);
    let promotedBooking = null;

    if (slot) {
      if (slot.waitlist && slot.waitlist.length > 0) {
        // Promote next user in line
        const nextUserObj = slot.waitlist.shift(); // FIFO
        await slot.save();

        const promotedUserId = nextUserObj.userId;
        const slotDayEnd = new Date(`${slot.date}T23:59:59`);
        const diffSeconds = Math.max(300, Math.ceil((slotDayEnd.getTime() - new Date().getTime()) / 1000));

        const tokenPayload = {
          userId: promotedUserId.toString(),
          slotId: slot._id.toString(),
          date: slot.date,
          hour: slot.hour
        };

        const qrToken = jwt.sign(
          tokenPayload,
          process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345',
          { expiresIn: diffSeconds }
        );

        // Create booking for waitlisted user
        promotedBooking = await Booking.create({
          userId: promotedUserId,
          slotId: slot._id,
          date: slot.date,
          hour: slot.hour,
          qrToken,
          checkedIn: false
        });

        // Simulate Notification (log to console and in-app system output)
        console.log(`[Waitlist Promotion] User ${promotedUserId} promoted to slot ${slot.hour}:00 on date ${slot.date}`);
      } else {
        // Decrement capacity
        slot.bookedCount = Math.max(0, slot.bookedCount - 1);
        await slot.save();
      }

      // Broadcast the slot capacity update to all listening clients
      const io = req.app.get('io');
      if (io) {
        io.emit('slotUpdate', slot);
      }
    }

    res.json({ message: 'Booking cancelled successfully', promoted: promotedBooking ? true : false });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Server error cancelling booking' });
  }
});

// @desc    Verify booking QR entry pass (Staff only)
// @route   POST /api/bookings/verify
// @access  Private (Staff/Admin only)
router.post('/verify', protect, isStaff, async (req, res) => {
  const { qrToken } = req.body;
  const staffId = req.user._id;

  if (!qrToken) {
    return res.status(400).json({ message: 'QR pass token is required' });
  }

  let decoded = null;
  let booking = null;

  try {
    // 1. Decode and verify JWT signature
    try {
      decoded = jwt.verify(qrToken, process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345');
    } catch (err) {
      const reason = err.name === 'TokenExpiredError' ? 'Token Expired' : 'Invalid Signature';
      await AuditLog.create({
        staffId,
        qrToken,
        status: 'failed',
        reason
      });
      return res.status(400).json({ message: `${reason}. Access denied.` });
    }

    const { userId, slotId, date, hour } = decoded;

    // 2. Fetch booking
    booking = await Booking.findOne({ userId, slotId, date, hour, qrToken });

    if (!booking) {
      const reason = 'Booking record not found or has been cancelled';
      await AuditLog.create({ staffId, qrToken, status: 'failed', reason });
      return res.status(404).json({ message: reason });
    }

    // 3. Double-entry check
    if (booking.checkedIn) {
      const reason = 'Entry pass already used. Checked in previously.';
      await AuditLog.create({ staffId, qrToken, bookingId: booking._id, status: 'failed', reason });
      return res.status(400).json({ message: reason });
    }

    // 4. Current date verification
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (booking.date !== todayStr) {
      const reason = `Incorrect Date: Booking is for ${booking.date}, but today is ${todayStr}.`;
      await AuditLog.create({ staffId, qrToken, bookingId: booking._id, status: 'failed', reason });
      return res.status(400).json({ message: reason });
    }

    // 5. Booking hour window verification
    const currentHour = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: 'numeric' }), 10);
    const currentMinutes = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, minute: 'numeric' }), 10);
    const isHourMatch = currentHour === booking.hour;
    const isEarlyBuffer = (currentHour === booking.hour - 1) && (currentMinutes >= 45); // 15 mins early buffer

    if (!isHourMatch && !isEarlyBuffer) {
      const reason = `Incorrect Hour: Booking is for ${booking.hour}:00, but current hour is ${currentHour}:00.`;
      await AuditLog.create({ staffId, qrToken, bookingId: booking._id, status: 'failed', reason });
      return res.status(400).json({ message: reason });
    }

    // 6. Access Granted! Update booking & User attendance streaks
    booking.checkedIn = true;
    await booking.save();

    const attendee = await User.findById(userId);
    if (attendee) {
      attendee.totalSessionsAttended = (attendee.totalSessionsAttended || 0) + 1;
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      if (!attendee.lastCheckInDate) {
        // First check-in
        attendee.streakCurrent = 1;
        attendee.streakMax = 1;
      } else if (attendee.lastCheckInDate === yesterdayStr) {
        // Consecutive check-in
        attendee.streakCurrent = (attendee.streakCurrent || 0) + 1;
        if (attendee.streakCurrent > (attendee.streakMax || 0)) {
          attendee.streakMax = attendee.streakCurrent;
        }
      } else if (attendee.lastCheckInDate !== todayStr) {
        // Streak broken
        attendee.streakCurrent = 1;
      }
      
      attendee.lastCheckInDate = todayStr;
      await attendee.save();
    }

    // Log check-in success
    await AuditLog.create({
      staffId,
      bookingId: booking._id,
      qrToken,
      status: 'success',
      reason: 'Check-in successful'
    });

    res.json({
      success: true,
      message: 'Access Granted! Enjoy your workout.',
      booking: {
        _id: booking._id,
        date: booking.date,
        hour: booking.hour,
        checkedInAt: new Date()
      },
      user: {
        name: attendee ? attendee.name : 'Unknown User',
        email: attendee ? attendee.email : ''
      }
    });

  } catch (error) {
    console.error('QR code verification error:', error);
    res.status(500).json({ message: error.message || 'Server error verifying pass' });
  }
});

export default router;
