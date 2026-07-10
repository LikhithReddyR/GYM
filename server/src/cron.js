import cron from 'node-cron';
import Membership from './models/Membership.js';
import Booking from './models/Booking.js';
import User from './models/User.js';

// Helper function to run the expiry logic
export const checkAndExpireMemberships = async () => {
  console.log('[Cron] Checking for expired memberships...');
  try {
    const now = new Date();
    // Update active memberships whose end dates are in the past
    const result = await Membership.updateMany(
      { status: 'active', endDate: { $lt: now } },
      { $set: { status: 'expired' } }
    );
    console.log(`[Cron] Completed checking. Expired ${result.modifiedCount} memberships.`);
  } catch (error) {
    console.error('[Cron] Error running membership check:', error);
  }
};

// Helper function to send slot reminders
export const sendSlotReminders = async () => {
  console.log('[Cron] Checking for upcoming slots in 30 minutes...');
  try {
    const now = new Date();
    // Local date string for Asia/Kolkata timezone
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // Target hour starting in 30 minutes
    const thirtyMinFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const targetHour = parseInt(thirtyMinFromNow.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: 'numeric' }), 10);

    const bookings = await Booking.find({
      date: todayStr,
      hour: targetHour,
      checkedIn: false
    }).populate('userId', 'name email');

    bookings.forEach(booking => {
      if (booking.userId) {
        console.log(`[IN-APP ALERT / REMINDER] Hi ${booking.userId.name}, your workout slot is scheduled for ${booking.hour}:00 today (${booking.date}). Present your QR entry pass at the gate!`);
      }
    });

    console.log(`[Cron] Reminders complete. Notified ${bookings.length} users.`);
  } catch (error) {
    console.error('[Cron] Error running slot reminders check:', error);
  }
};

const initCronJobs = () => {
  // Run on startup
  checkAndExpireMemberships();
  sendSlotReminders();

  // Schedule to run every day at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    await checkAndExpireMemberships();
  });
  console.log('[Cron] Scheduled membership check job (daily at midnight).');

  // Schedule to run every 15 minutes (*/15 * * * *) for reminders
  cron.schedule('*/15 * * * *', async () => {
    await sendSlotReminders();
  });
  console.log('[Cron] Scheduled slot reminders job (every 15 minutes).');
};

export default initCronJobs;
