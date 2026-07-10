import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
    role: {
      type: String,
      enum: ['user', 'staff', 'admin'],
      default: 'user'
    },
    streakCurrent: {
      type: Number,
      default: 0
    },
    streakMax: {
      type: Number,
      default: 0
    },
    lastCheckInDate: {
      type: String // YYYY-MM-DD
    },
    totalSessionsAttended: {
      type: Number,
      default: 0
    }
  }, {
    timestamps: true
  });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
