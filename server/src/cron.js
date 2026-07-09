import cron from 'node-cron';
import Membership from './models/Membership.js';

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

const initCronJobs = () => {
  // Run on startup
  checkAndExpireMemberships();

  // Schedule to run every day at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    await checkAndExpireMemberships();
  });
  console.log('[Cron] Scheduled membership check job (daily at midnight).');
};

export default initCronJobs;
