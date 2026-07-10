import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import Membership from '../models/Membership.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Helper to determine plan details
const getPlanDetails = (plan) => {
  switch (plan) {
    case 'monthly':
      return { days: 30, amount: 500 }; // INR 500
    case 'quarterly':
      return { days: 90, amount: 1300 }; // INR 1300
    case 'yearly':
      return { days: 365, amount: 4500 }; // INR 4500
    default:
      throw new Error('Invalid plan selected');
  }
};

// Determine if running in mock payment mode
const isMockMode = 
  process.env.MOCK_PAYMENT_MODE === 'true' || 
  !process.env.RAZORPAY_KEY_ID || 
  process.env.RAZORPAY_KEY_ID.includes('mock');

// Initialize Razorpay instance if keys are configured and not in mock mode
let razorpay;
if (!isMockMode && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  } catch (error) {
    console.error('Failed to initialize Razorpay SDK. Falling back to mock payments.', error);
  }
}

// @desc    Get user's current membership status & days left
// @route   GET /api/membership/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const membership = await Membership.findOne({ userId: req.user._id });

    if (!membership) {
      return res.json({
        status: 'inactive',
        daysLeft: 0,
        plan: null,
        endDate: null
      });
    }

    const now = new Date();
    // Calculate days left
    const diffTime = membership.endDate.getTime() - now.getTime();
    const daysLeft = diffTime > 0 ? Math.ceil(diffTime / 86400000) : 0;

    // Dynamically update status if expired in db
    let status = membership.status;
    if (membership.endDate < now && status === 'active') {
      membership.status = 'expired';
      await membership.save();
      status = 'expired';
    }

    // Fetch user bookings to calculate preferred slot and history
    const Booking = (await import('../models/Booking.js')).default;
    const bookings = await Booking.find({ userId: req.user._id });
    
    let mostBookedSlot = undefined;
    if (bookings.length > 0) {
      const hourCounts = {};
      bookings.forEach(b => {
        hourCounts[b.hour] = (hourCounts[b.hour] || 0) + 1;
      });
      let maxCount = -1;
      Object.keys(hourCounts).forEach(h => {
        if (hourCounts[h] > maxCount) {
          maxCount = hourCounts[h];
          mostBookedSlot = parseInt(h, 10);
        }
      });
    }

    res.json({
      _id: membership._id,
      plan: membership.plan,
      startDate: membership.startDate,
      endDate: membership.endDate,
      status,
      amount: membership.amount,
      daysLeft,
      userStreakCurrent: req.user.streakCurrent || 0,
      userStreakMax: req.user.streakMax || 0,
      userTotalSessions: req.user.totalSessionsAttended || 0,
      mostBookedSlot
    });
  } catch (error) {
    console.error('Error fetching membership profile:', error);
    res.status(500).json({ message: 'Server error retrieving membership details' });
  }
});

// @desc    Create membership payment order
// @route   POST /api/membership/create-order
// @access  Private
router.post('/create-order', protect, async (req, res) => {
  const { plan } = req.body;

  try {
    const { amount } = getPlanDetails(plan);

    // If using mock payment mode or Razorpay is not configured
    if (isMockMode || !razorpay) {
      const mockOrder = {
        id: `mock_order_${crypto.randomBytes(8).toString('hex')}`,
        entity: 'order',
        amount: amount * 100, // paisa
        amount_paid: 0,
        amount_due: amount * 100,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
        status: 'created',
        notes: { plan, userId: req.user._id.toString() },
        created_at: Math.floor(Date.now() / 1000),
        isMock: true
      };
      return res.status(201).json(mockOrder);
    }

    // Normal Razorpay payment order
    const options = {
      amount: amount * 100, // amount in paisa
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        plan,
        userId: req.user._id.toString()
      }
    };

    const order = await razorpay.orders.create(options);
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: error.message || 'Error creating payment order' });
  }
});

// @desc    Verify payment signature and activate/renew membership
// @route   POST /api/membership/verify-payment
// @access  Private
router.post('/verify-payment', protect, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, isMock } = req.body;

  try {
    let isValid = false;

    // Verify payment authenticity
    if (isMock || isMockMode || !razorpay) {
      // For mock checkout, check mock signature structure or bypass
      if (razorpay_signature === 'mock_signature_valid' || (razorpay_order_id && razorpay_order_id.startsWith('mock_order_'))) {
        isValid = true;
      }
    } else {
      // Real Razorpay signature check
      const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generated_signature = hmac.digest('hex');
      isValid = generated_signature === razorpay_signature;
    }

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid payment signature. Verification failed.' });
    }

    // Payment is valid, determine new membership dates
    const { days, amount } = getPlanDetails(plan);
    const existingMembership = await Membership.findOne({ userId: req.user._id });
    
    let startDate = new Date();
    let endDate = new Date();

    // Extend if active, otherwise start fresh
    if (existingMembership && existingMembership.status === 'active' && existingMembership.endDate > new Date()) {
      startDate = existingMembership.startDate;
      endDate = new Date(existingMembership.endDate.getTime() + days * 24 * 60 * 60 * 1000);
    } else {
      endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    }

    let membership;
    if (existingMembership) {
      existingMembership.plan = plan;
      existingMembership.startDate = startDate;
      existingMembership.endDate = endDate;
      existingMembership.status = 'active';
      existingMembership.paymentId = razorpay_payment_id || `mock_pay_${Date.now()}`;
      existingMembership.amount = amount;
      membership = await existingMembership.save();
    } else {
      membership = await Membership.create({
        userId: req.user._id,
        plan,
        startDate,
        endDate,
        status: 'active',
        paymentId: razorpay_payment_id || `mock_pay_${Date.now()}`,
        amount
      });
    }

    res.status(200).json({
      message: 'Membership activated successfully',
      membership
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: error.message || 'Payment verification failed' });
  }
});

// @desc    Get admin analytics data
// @route   GET /api/membership/analytics
// @access  Private (Admin only)
router.get('/analytics', protect, async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
}, async (req, res) => {
  try {
    const memberships = await Membership.find({});
    
    let revenueData = { monthly: 0, quarterly: 0, yearly: 0, total: 0 };
    memberships.forEach(m => {
      const planName = m.plan === 'yearly' ? 'yearly' : m.plan;
      if (revenueData[planName] !== undefined) {
        revenueData[planName] += m.amount;
      }
      revenueData.total += m.amount;
    });

    const activeCount = await Membership.countDocuments({ status: 'active' });
    const expiredCount = await Membership.countDocuments({ status: 'expired' });
    const membershipCounts = [
      { name: 'Active Memberships', value: activeCount },
      { name: 'Expired Memberships', value: expiredCount }
    ];

    const bookings = await Booking.find({});
    const hourCounts = Array.from({ length: 24 }).map((_, i) => ({ hour: i, count: 0 }));
    bookings.forEach(b => {
      if (b.hour >= 0 && b.hour < 24) {
        hourCounts[b.hour].count += 1;
      }
    });

    const peakHoursData = hourCounts.filter(h => h.hour >= 6 && h.hour <= 21).map(h => {
      const ampm = h.hour >= 12 ? 'PM' : 'AM';
      const dispHr = h.hour > 12 ? h.hour - 12 : h.hour === 0 ? 12 : h.hour;
      return {
        name: `${dispHr}:00 ${ampm}`,
        bookings: h.count
      };
    });

    res.json({
      revenue: [
        { name: 'Monthly Plan', value: revenueData.monthly },
        { name: 'Quarterly Plan', value: revenueData.quarterly },
        { name: 'Annual Plan', value: revenueData.yearly }
      ],
      totalRevenue: revenueData.total,
      memberships: membershipCounts,
      peakHours: peakHoursData
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error retrieving analytics stats' });
  }
});

export default router;
