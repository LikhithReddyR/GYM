import mongoose from 'mongoose';

const timeSlotSchema = new mongoose.Schema({
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  hour: {
    type: Number, // 0 to 23 (e.g., 6 for 6 AM, 21 for 9 PM)
    required: true
  },
  capacity: {
    type: Number,
    required: true,
    default: 30
  },
  bookedCount: {
    type: Number,
    required: true,
    default: 0
  },
  waitlist: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, {
  timestamps: true
});

// Compound unique index on date + hour to prevent duplicate time slots
timeSlotSchema.index({ date: 1, hour: 1 }, { unique: true });

const TimeSlot = mongoose.model('TimeSlot', timeSlotSchema);

export default TimeSlot;
