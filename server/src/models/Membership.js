import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // A user has one membership history record that gets updated/extended
  },
  plan: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  paymentId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  autoRenew: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const Membership = mongoose.model('Membership', membershipSchema);

export default Membership;
