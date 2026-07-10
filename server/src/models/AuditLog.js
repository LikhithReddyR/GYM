import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookingId: {
    type: String, // String representation because it might be invalid/null in case of failed checkin
    default: null
  },
  qrToken: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    required: true
  },
  reason: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
