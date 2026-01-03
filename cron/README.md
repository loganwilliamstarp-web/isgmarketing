# Email Automation Cron Service

This is a lightweight Node.js service that triggers the email processing edge function on a schedule.

## What it Does

- **Daily at 6 AM UTC**: Runs the full email automation cycle:
  - `refresh`: Finds new qualifying accounts for active automations
  - `verify`: 24-hour verification check before sending
  - `send`: Sends all ready-to-send emails via SendGrid

- **Every hour**: Runs `refresh` to find new qualifying accounts for active automations

- **Every 30 minutes**: Runs `verify` + `send` to check pending emails and send any that are ready

## Deployment on Railway

### Step 1: Create a New Service

1. Go to your Railway project dashboard
2. Click **"+ New"** → **"Empty Service"**
3. Name it `email-cron` or similar

### Step 2: Connect the Repository

1. In the new service, go to **Settings** → **Source**
2. Connect your GitHub repository
3. Set the **Root Directory** to: `cron`
4. Railway will auto-detect the Dockerfile

### Step 3: Configure Environment Variables

In the service's **Variables** tab, add:

| Variable | Value | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | `https://your-project.supabase.co` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key (from Supabase dashboard → Settings → API) |
| `DAILY_RUN_HOUR` | `6` | (Optional) Hour in UTC when daily processing runs (default: 6) |

**Important**: Use the **Service Role Key**, not the anon key. The service role key is required to call edge functions with full permissions.

### Step 4: Deploy

1. Click **Deploy** or push to your repository
2. The service will build and start automatically
3. Check the logs to verify it's running

## Logs

The service logs its activity:

```
============================================================
ISG Marketing Email Cron Service
============================================================
Supabase URL: https://your-project.supab...
Service Key: ***configured***
Daily run hour: 6:00 UTC
Refresh checks: every hour
Verify + Send checks: every 30 minutes
============================================================
Running initial send check on startup...
[2024-01-15T10:30:00.000Z] Calling edge function with action: send
[2024-01-15T10:30:01.234Z] Edge function result: {
  "action": "send",
  "sent": 5,
  "failed": 0,
  ...
}
Starting cron loop...
```

## Customization

### Change the Daily Run Time

Set the `DAILY_RUN_HOUR` environment variable (0-23 UTC):

- `6` = 6 AM UTC (default)
- `14` = 2 PM UTC / 9 AM EST
- `0` = Midnight UTC

### Disable 30-Minute Checks

If you only want the daily run, modify `cron-job.js` and comment out the `checkAndProcess()` call.

## Troubleshooting

### "Edge function error: Unauthorized"

- Make sure you're using the **Service Role Key**, not the anon key
- Check the key hasn't expired or been rotated

### Emails not sending

1. Check the cron service logs for errors
2. Verify `SENDGRID_API_KEY` is set in Supabase edge function secrets
3. Check the Supabase dashboard → Edge Functions → Logs

### Service keeps restarting

Check for missing environment variables - the service will exit if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are not set.
