import express from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import TimeSlot from '../models/TimeSlot.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Membership from '../models/Membership.js';
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

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  try {
    let slots = await TimeSlot.find({ date }).sort({ hour: 1 });

    if (slots.length === 0) {
      const defaultSlots = [];
      for (let hr = 6; hr <= 21; hr++) {
        defaultSlots.push({
          date,
          hour: hr,
          capacity: 30,
          bookedCount: 0,
          waitlist: []
        });
      }
      
      try {
        slots = await TimeSlot.insertMany(defaultSlots, { ordered: false });
      } catch (err) {
        slots = await TimeSlot.find({ date }).sort({ hour: 1 });
      }
    }

    res.json(slots);
  } catch (error) {
    console.error('Error fetching/seeding slots:', error);
    res.status(500).json({ message: 'Server error retrieving slots list' });
  }
});

// @desc    Book a slot (Membership gated, optional Book-with-a-friend tag & Atomic capacity gated)
// @route   POST /api/slots/:id/book
// @access  Private (Membership active)
router.post('/:id/book', protect, checkMembership, async (req, res) => {
  const slotId = req.params.id;
  const userId = req.user._id;
  const { friendEmail } = req.body;

  try {
    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Time slot not found' });
    }

    // Step 1: Check user's own double booking
    const existingBooking = await Booking.findOne({ userId, slotId });
    if (existingBooking) {
      return res.status(400).json({ message: 'You have already booked this time slot' });
    }

    const duplicateTimeBooking = await Booking.findOne({ userId, date: slot.date, hour: slot.hour });
    if (duplicateTimeBooking) {
      return res.status(400).json({ message: 'You have already booked a gym slot at this hour' });
    }

    // Handle Book-with-a-friend logic if tag present
    let friend = null;
    if (friendEmail) {
      const normalizedEmail = friendEmail.trim().toLowerCase();
      if (normalizedEmail === req.user.email.toLowerCase()) {
        return res.status(400).json({ message: 'You cannot tag yourself as a friend' });
      }

      friend = await User.findOne({ email: normalizedEmail });
      if (!friend) {
        return res.status(400).json({ message: `Friend with email ${friendEmail} not found` });
      }

      // Check friend's membership
      const friendMembership = await Membership.findOne({ userId: friend._id });
      const now = new Date();
      if (!friendMembership || friendMembership.status !== 'active' || friendMembership.endDate < now) {
        return res.status(400).json({ message: 'Friend does not have an active gym membership plan' });
      }

      // Check friend double booking
      const friendExistingBooking = await Booking.findOne({ userId: friend._id, slotId });
      if (friendExistingBooking) {
        return res.status(400).json({ message: 'Friend has already booked this time slot' });
      }

      const friendDuplicateTime = await Booking.findOne({ userId: friend._id, date: slot.date, hour: slot.hour });
      if (friendDuplicateTime) {
        return res.status(400).json({ message: 'Friend has already booked a gym slot at this hour' });
      }
    }

    // Step 2: Atomic update to check capacity and increment count
    const incrementAmount = friend ? 2 : 1;
    const updatedSlot = await TimeSlot.findOneAndUpdate(
      { _id: slotId, bookedCount: { $lte: slot.capacity - incrementAmount } },
      { $inc: { bookedCount: incrementAmount } },
      { new: true }
    );

    if (!updatedSlot) {
      return res.status(400).json({ message: friend ? 'Not enough capacity left for two bookings' : 'Slot already full' });
    }

    // Emit live updates via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', updatedSlot);
    }

    // Step 3: Create Booking signatures
    const slotDayEnd = new Date(`${slot.date}T23:59:59`);
    const diffSeconds = Math.max(300, Math.ceil((slotDayEnd.getTime() - new Date().getTime()) / 1000));

    // User Booking creation
    const userPayload = { userId: userId.toString(), slotId: slot._id.toString(), date: slot.date, hour: slot.hour };
    const userToken = jwt.sign(userPayload, process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345', { expiresIn: diffSeconds });
    const userQr = await QRCode.toDataURL(userToken);

    const userBooking = await Booking.create({
      userId,
      slotId,
      date: slot.date,
      hour: slot.hour,
      qrToken: userToken,
      checkedIn: false,
      friendUserId: friend ? friend._id : null
    });

    let friendBookingDetails = null;
    if (friend) {
      // Friend Booking creation
      const friendPayload = { userId: friend._id.toString(), slotId: slot._id.toString(), date: slot.date, hour: slot.hour };
      const friendToken = jwt.sign(friendPayload, process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345', { expiresIn: diffSeconds });
      
      const friendBooking = await Booking.create({
        userId: friend._id,
        slotId,
        date: slot.date,
        hour: slot.hour,
        qrToken: friendToken,
        checkedIn: false,
        friendUserId: userId
      });

      friendBookingDetails = {
        _id: friendBooking._id,
        name: friend.name,
        email: friend.email
      };
    }

    res.status(201).json({
      message: friend ? 'Booked successfully for you and your friend!' : 'Booking successful',
      booking: {
        _id: userBooking._id,
        date: userBooking.date,
        hour: userBooking.hour,
        checkedIn: userBooking.checkedIn,
        timestamp: userBooking.timestamp,
        friend: friendBookingDetails
      },
      qrCode: userQr
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: error.message || 'Error occurred while booking slot' });
  }
});

// @desc    Join a slot waitlist
// @route   POST /api/slots/:id/waitlist
// @access  Private (Membership active)
router.post('/:id/waitlist', protect, checkMembership, async (req, res) => {
  const slotId = req.params.id;
  const userId = req.user._id;

  try {
    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Time slot not found' });
    }

    // Check if slot is actually full
    if (slot.bookedCount < slot.capacity) {
      return res.status(400).json({ message: 'Slot is not full yet. Book directly.' });
    }

    // Check if user is already on waitlist
    const isOnWaitlist = slot.waitlist.some(item => item.userId.toString() === userId.toString());
    if (isOnWaitlist) {
      return res.status(400).json({ message: 'You are already on the waitlist for this slot' });
    }

    // Check if user has booking
    const existingBooking = await Booking.findOne({ userId, slotId });
    if (existingBooking) {
      return res.status(400).json({ message: 'You have already booked this time slot' });
    }

    slot.waitlist.push({ userId });
    await slot.save();

    res.json({
      success: true,
      message: 'Successfully added to waitlist!',
      position: slot.waitlist.length
    });
  } catch (error) {
    console.error('Waitlist error:', error);
    res.status(500).json({ message: error.message || 'Error joining waitlist' });
  }
});

export default router;
