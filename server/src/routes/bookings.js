import express from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import Booking from '../models/Booking.js';
import TimeSlot from '../models/TimeSlot.js';
import User from '../models/User.js';
import { protect, isStaff } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get current user's bookings with dynamically generated base64 QRs
// @route   GET /api/bookings/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .sort({ date: -1, hour: -1 });

    // Generate QR images on the fly to save DB storage
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
  const targetDate = date || new Date().toLocaleDateString('en-CA');
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

// @desc    Cancel a booking and free up slot capacity
// @route   DELETE /api/bookings/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
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

    // Decrement the slot's booked count
    await TimeSlot.updateOne({ _id: booking.slotId }, { $inc: { bookedCount: -1 } });

    res.json({ message: 'Booking cancelled successfully' });
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

  if (!qrToken) {
    return res.status(400).json({ message: 'QR pass token is required' });
  }

  try {
    // 1. Decode and verify JWT signature
    let decoded;
    try {
      decoded = jwt.verify(qrToken, process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345');
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'Entry pass has expired. Access denied.' });
      }
      return res.status(400).json({ message: 'Invalid or corrupted entry pass. Access denied.' });
    }

    const { userId, slotId, date, hour } = decoded;

    // 2. Fetch booking and corresponding user details
    const booking = await Booking.findOne({ userId, slotId, date, hour, qrToken });

    if (!booking) {
      return res.status(404).json({ message: 'Booking record not found or has been cancelled' });
    }

    // 3. Double-entry / Screenshot reuse check
    if (booking.checkedIn) {
      return res.status(400).json({ message: 'Entry pass already used. Checked in previously.' });
    }

    // 4. Current date and hour match gate
    // Date format: YYYY-MM-DD
    const todayStr = new Date().toLocaleDateString('en-CA'); // Format: YYYY-MM-DD (ISO/local)
    
    // Check if the booking is for today
    if (booking.date !== todayStr) {
      return res.status(400).json({ 
        message: `Incorrect Date: Booking is for ${booking.date}, but today is ${todayStr}.` 
      });
    }

    // Check if the current hour is within booking window
    // (We allow entry during the booked hour, or up to 15 minutes before the booked hour)
    const currentHour = new Date().getHours();
    const isHourMatch = currentHour === booking.hour;
    const isEarlyBuffer = (currentHour === booking.hour - 1) && (new Date().getMinutes() >= 45); // 15 mins early buffer

    if (!isHourMatch && !isEarlyBuffer) {
      return res.status(400).json({
        message: `Incorrect Hour: Booking is for ${booking.hour}:00, but current hour is ${currentHour}:00.`
      });
    }

    // 5. Success! Check in the user
    booking.checkedIn = true;
    await booking.save();

    const attendee = await User.findById(userId).select('name email');

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
