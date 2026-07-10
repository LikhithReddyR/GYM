import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Too many authentication requests. Please try again in 15 minutes.' }
});

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345', {
    expiresIn: '30d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, staffSecret } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Determine role based on secret code
    let role = 'user';
    if (staffSecret) {
      let configStaffSecret = (process.env.STAFF_SECRET || 'GymStaffSecret2026').trim();
      // Remove any surrounding single or double quotes (e.g. from copy-pasting into env settings)
      if ((configStaffSecret.startsWith('"') && configStaffSecret.endsWith('"')) ||
          (configStaffSecret.startsWith("'") && configStaffSecret.endsWith("'"))) {
        configStaffSecret = configStaffSecret.slice(1, -1).trim();
      }

      if (staffSecret.trim().toLowerCase() === configStaffSecret.toLowerCase()) {
        role = 'staff';
      } else {
        return res.status(400).json({ message: 'Invalid staff secret code' });
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      role
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  });
});

export default router;
