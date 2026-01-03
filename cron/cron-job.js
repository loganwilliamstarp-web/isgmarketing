// cron/cron-job.js
// Cron service to trigger email processing on a schedule
// This runs as a separate Railway service

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Schedule configuration (in milliseconds)
const DAILY_RUN_HOUR = parseInt(process.env.DAILY_RUN_HOUR || '6', 10); // Default: 6 AM UTC
const CHECK_INTERVAL = 60 * 1000; // Check every minute

async function callEdgeFunction(action) {
  const url = `${SUPABASE_URL}/functions/v1/process-scheduled-emails`;

  console.log(`[${new Date().toISOString()}] Calling edge function with action: ${action}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[${new Date().toISOString()}] Edge function error:`, result);
      return { success: false, error: result };
    }

    console.log(`[${new Date().toISOString()}] Edge function result:`, JSON.stringify(result, null, 2));
    return { success: true, result };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to call edge function:`, error.message);
    return { success: false, error: error.message };
  }
}

// Track if we've run today
let lastRunDate = null;

async function checkAndRun() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Run once per day at the specified hour
  if (currentHour === DAILY_RUN_HOUR && lastRunDate !== currentDate) {
    console.log(`[${now.toISOString()}] Starting daily email processing...`);

    // Run the daily action (refresh + verify + send)
    const result = await callEdgeFunction('daily');

    if (result.success) {
      lastRunDate = currentDate;
      console.log(`[${now.toISOString()}] Daily processing complete.`);
    } else {
      console.error(`[${now.toISOString()}] Daily processing failed, will retry next minute.`);
    }
  }
}

// Run "send" every 30 minutes for faster delivery
let lastSendSlot = null;

async function checkAndSend() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinutes = now.getUTCMinutes();
  const currentDate = now.toISOString().split('T')[0];

  // Create a slot key for every 30-minute window (0-29 = slot 0, 30-59 = slot 1)
  const slot = currentMinutes < 30 ? 0 : 1;
  const slotKey = `${currentDate}-${currentHour}-${slot}`;

  // Run send every 30 minutes (in addition to daily full run)
  if (lastSendSlot !== slotKey) {
    // Skip if this is the daily run hour and first slot (already handled by daily run)
    if (currentHour === DAILY_RUN_HOUR && slot === 0) {
      lastSendSlot = slotKey;
      return;
    }

    console.log(`[${now.toISOString()}] Running 30-minute send check...`);
    const result = await callEdgeFunction('send');

    if (result.success) {
      lastSendSlot = slotKey;
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('ISG Marketing Email Cron Service');
  console.log('='.repeat(60));
  console.log(`Supabase URL: ${SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET'}`);
  console.log(`Service Key: ${SUPABASE_SERVICE_ROLE_KEY ? '***configured***' : 'NOT SET'}`);
  console.log(`Daily run hour: ${DAILY_RUN_HOUR}:00 UTC`);
  console.log(`Send checks: every 30 minutes`);
  console.log('='.repeat(60));

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: Missing required environment variables!');
    console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Run immediately on startup to catch any pending emails
  console.log('Running initial send check on startup...');
  await callEdgeFunction('send');

  // Start the check loop
  console.log('Starting cron loop...');
  setInterval(async () => {
    await checkAndRun();
    await checkAndSend();
  }, CHECK_INTERVAL);

  // Keep the process alive
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    process.exit(0);
  });
}

main().catch(console.error);
