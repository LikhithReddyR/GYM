import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeSlot',
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  hour: {
    type: Number, // 0 to 23
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  qrToken: {
    type: String,
    required: true
  },
  checkedIn: {
    type: Boolean,
    default: false
  },
  friendUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Unique compound index to prevent a user from double-booking the exact same slot
bookingSchema.index({ userId: 1, slotId: 1 }, { unique: true });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
