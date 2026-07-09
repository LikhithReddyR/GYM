import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Membership from '../models/Membership.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_token_key_for_gym_facility_12345');

      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found, authorization failed' });
      }
      next();
    } catch (error) {
      console.error('JWT verification error:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

export const checkMembership = async (req, res, next) => {
  try {
    const membership = await Membership.findOne({ userId: req.user._id });

    if (!membership) {
      return res.status(403).json({ message: 'Membership expired — renew to book' });
    }

    const now = new Date();
    if (membership.status !== 'active' || membership.endDate < now) {
      return res.status(403).json({ message: 'Membership expired — renew to book' });
    }

    next();
  } catch (error) {
    console.error('Membership check error:', error);
    res.status(500).json({ message: 'Server error checking membership status' });
  }
};

export const isStaff = (req, res, next) => {
  if (req.user && (req.user.role === 'staff' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as staff' });
  }
};
