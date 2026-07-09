import express from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import TimeSlot from '../models/TimeSlot.js';
import Booking from '../models/Booking.js';
import { protect, checkMembership } from '../middleware/auth.js';

const router = express.Router();

// @desc    List hourly slots for a specific date (auto-seeds if they do not exist)
// @route   GET /api/slots
// @access  Private
router.get('/', protect, async (req, res) => {
  const { date } = req.query; // Expects YYYY-MM-DD

  if (!date) {
    return res.status(400).json({ message: 'Date parameter is required (YYYY-MM-DD)' });
  }

  // Basic regex validation for YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  try {
    // Attempt to find existing slots for the date
    let slots = await TimeSlot.find({ date }).sort({ hour: 1 });

    // Auto-seed slots for the date if none exist
    // Fixed operating hours: 6 AM to 10 PM (16 slots: 6:00 to 21:00 starting hours)
    if (slots.length === 0) {
      const defaultSlots = [];
      for (let hr = 6; hr <= 21; hr++) {
        defaultSlots.push({
          date,
          hour: hr,
          capacity: 30,
          bookedCount: 0
        });
      }
      
      try {
        // Bulk write to DB (with ordered: false to skip duplicate insertions if another request races it)
        slots = await TimeSlot.insertMany(defaultSlots, { ordered: false });
      } catch (err) {
        // In case of race conditions during concurrent seedings, fetch what was seeded by the competing request
        slots = await TimeSlot.find({ date }).sort({ hour: 1 });
      }
    }

    res.json(slots);
  } catch (error) {
    console.error('Error fetching/seeding slots:', error);
    res.status(500).json({ message: 'Server error retrieving slots list' });
  }
});

// @desc    Book a slot (Membership gated & Atomic capacity gated)
// @route   POST /api/slots/:id/book
// @access  Private (Membership active)
router.post('/:id/book', protect, checkMembership, async (req, res) => {
  const slotId = req.params.id;
  const userId = req.user._id;

  try {
    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Time slot not found' });
    }

    // Step 1: Check if the user has already booked this slot before modifying anything
    const existingBooking = await Booking.findOne({ userId, slotId });
    if (existingBooking) {
      return res.status(400).json({ message: 'You have already booked this time slot' });
    }

    // Step 1b: Check if they already booked a slot at the exact same hour/date
    const duplicateTimeBooking = await Booking.findOne({ userId, date: slot.date, hour: slot.hour });
    if (duplicateTimeBooking) {
      return res.status(400).json({ message: 'You have already booked a gym slot at this hour' });
    }

    // Step 2: Atomic update to check capacity and increment count
    const updatedSlot = await TimeSlot.findOneAndUpdate(
      { _id: slotId, bookedCount: { $lt: slot.capacity } },
      { $inc: { bookedCount: 1 } },
      { new: true }
    );

    if (!updatedSlot) {
      return res.status(400).json({ message: 'Slot already full — capacity reached (30/30)' });
    }

    // Step 3: Create JWT and base64 QR Code
    // Set token expiration to the end of that day (11:59:59 PM in slot's local timezone / UTC representation)
    const slotDayEnd = new Date(`${slot.date}T23:59:59`);
    const now = new Date();
    const diffSeconds = Math.max(300, Math.ceil((slotDayEnd.getTime() - now.getTime()) / 1000)); // Min 5 min buffer

    const tokenPayload = {
      userId: userId.toString(),
      slotId: slot._id.toString(),
      date: slot.date,
      hour: slot.hour
    };

    const qrToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345',
      { expiresIn: diffSeconds }
    );

    // Generate base64 QR code image
    const qrCodeBase64 = await QRCode.toDataURL(qrToken);

    // Step 4: Write Booking document
    try {
      const booking = await Booking.create({
        userId,
        slotId,
        date: slot.date,
        hour: slot.hour,
        qrToken,
        checkedIn: false
      });

      res.status(201).json({
        message: 'Booking successful',
        booking: {
          _id: booking._id,
          date: booking.date,
          hour: booking.hour,
          checkedIn: booking.checkedIn,
          timestamp: booking.timestamp
        },
        qrCode: qrCodeBase64
      });
    } catch (dbError) {
      // Step 5: Rollback atomic capacity count in case of double-booking write index failure
      await TimeSlot.updateOne({ _id: slotId }, { $inc: { bookedCount: -1 } });

      if (dbError.code === 11000) {
        return res.status(400).json({ message: 'Double-booking prevention: You have already booked this slot.' });
      }
      throw dbError;
    }

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: error.message || 'Error occurred while booking slot' });
  }
});

export default router;
