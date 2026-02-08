# ISG Marketing — Salesforce LWC Deployment Guide

Two Lightning Web Components that surface marketing data from the ISG Marketing app inside Salesforce Account record pages via iframe embeds.

## Components

| Component | What It Shows |
|-----------|---------------|
| **Account Marketing Score** | Lead score (0-100, A-F grade), NPS promoter badge, star rating, feedback, score breakdown |
| **Account Email Activity** | Timeline of sent + scheduled emails, filter by All/Sent/Scheduled, preview modal with email HTML + engagement + replies |

## Architecture

```
SF Account Record Page
        |
   LWC Component (iframe wrapper)
        |  loads: https://isgmarketing-production.up.railway.app/:userId/embed/score/:accountId
        v
   React Embed Page (no sidebar/nav)
        |  uses existing Supabase hooks + data
        v
   PostgreSQL (accounts, email_logs, scheduled_emails, policies)
```

Each LWC is a thin iframe wrapper (~25 lines of JS) that loads a standalone React page. All data fetching, rendering, and interactivity happens in the React app. No Apex classes, Edge Functions, Named Credentials, or Remote Site Settings are needed.

## File Structure

```
lwc/
├── DEPLOYMENT-GUIDE.md              ← You are here
├── sfdx-project.json                ← Salesforce DX project config
└── force-app/main/default/
    └── lwc/
        ├── accountMarketingScore/   ← Lead score + NPS component
        │   ├── accountMarketingScore.js
        │   ├── accountMarketingScore.html
        │   ├── accountMarketingScore.css
        │   └── accountMarketingScore.js-meta.xml
        └── accountEmailActivity/    ← Email timeline + preview component
            ├── accountEmailActivity.js
            ├── accountEmailActivity.html
            ├── accountEmailActivity.css
            └── accountEmailActivity.js-meta.xml
```

React embed pages (in main `src/` directory):
```
src/pages/
├── EmbedMarketingScorePage.jsx      ← Standalone score card (no sidebar)
└── EmbedEmailActivityPage.jsx       ← Standalone email activity (no sidebar)
```

---

## Step 1: Get Your User ID

Your ISG Marketing User ID is the long alphanumeric string in your app URL. For example:

```
https://isgmarketing-production.up.railway.app/0056g000004jvyVAAQ/dashboard
                                                 ^^^^^^^^^^^^^^^^^^
                                                 This is your User ID
```

Copy this value — you'll need it when configuring the LWC components.

---

## Step 2: Deploy LWC to Salesforce

### Option A: Salesforce CLI (SFDX)

```bash
cd C:\Coding\isgmarketing-main\lwc

# Authorize your org (if not already done)
sfdx auth:web:login -a MyOrg

# Deploy LWC components only
sfdx force:source:deploy -p force-app/main/default/lwc -u MyOrg
```

### Option B: Manual Deployment via Salesforce UI

**LWC Components** (Developer Console → File → New → Lightning Web Component):
1. `accountMarketingScore` — copy the 4 files (js, html, css, meta.xml)
2. `accountEmailActivity` — copy the 4 files (js, html, css, meta.xml)

---

## Step 3: Add CSP Trusted Site

Salesforce blocks iframes from external domains by default. You must whitelist the app URL.

1. **Setup** → Search for **CSP Trusted Sites** → **New Trusted Site**
2. Fill in:
   - **Trusted Site Name:** `ISG_Marketing`
   - **Trusted Site URL:** `https://isgmarketing-production.up.railway.app`
   - **Active:** checked
   - **Context:** `All`
   - Check: **Allow site for frame-src**
3. **Save**

---

## Step 4: Add Components to Account Record Page

1. Navigate to any **Account record** in Salesforce
2. Click the **gear icon** → **Edit Page** (opens Lightning App Builder)
3. In the left panel under **Custom**, you'll see:
   - **Account Marketing Score**
   - **Account Email Activity**
4. **Drag** "Account Marketing Score" to the right sidebar
5. **Configure the component** — in the properties panel on the right:
   - **ISG Marketing User ID:** paste your User ID from Step 1 (e.g., `0056g000004jvyVAAQ`)
   - **App Base URL:** leave as default (`https://isgmarketing-production.up.railway.app`) or update if using a different environment
6. **Drag** "Account Email Activity" below it
7. **Configure** with the same User ID
8. Click **Save** → **Activate**
9. Choose activation:
   - **Org Default** — applies to all users
   - **App Default** — per Lightning app
   - **App, Record Type, Profile** — most granular
10. **Save**

---

## Lead Scoring Algorithm

Each factor counts **distinct emails only** (first open, not repeat opens):

| Factor | Points | Max |
|--------|--------|-----|
| Email opens (distinct emails with `first_opened_at`) | 5/email | 25 |
| Email clicks (distinct emails with `first_clicked_at`) | 10/email | 30 |
| Email replies (distinct emails with `first_replied_at`) | 15/email | 30 |
| NPS Promoter (4-5 stars) | 20 | 20 |
| NPS Passive (3 stars) | 10 | 10 |
| NPS Detractor (1-2 stars) | -10 | -10 |
| Active customer status | 15 | 15 |
| Has active policy | 10 | 10 |
| **Max total** | | **130 → normalized to 0-100** |

**Grades:** A (80+), B (60-79), C (40-59), D (20-39), F (0-19)

This algorithm runs in `src/utils/leadScore.js` and is used by both the main React app and the embed pages.

---

## Embed Page URLs

The LWC components load these React pages in an iframe:

| Component | Embed URL |
|-----------|-----------|
| Marketing Score | `/:userId/embed/score/:accountId` |
| Email Activity | `/:userId/embed/email-activity/:accountId` |

Where `accountId` is the Salesforce Account `Id` (provided automatically by `@api recordId`).

You can test these pages directly in a browser:
```
https://isgmarketing-production.up.railway.app/YOUR_USER_ID/embed/score/ACCOUNT_ID
https://isgmarketing-production.up.railway.app/YOUR_USER_ID/embed/email-activity/ACCOUNT_ID
```

---

## Verification Checklist

- [ ] CSP Trusted Site created for `https://isgmarketing-production.up.railway.app`
- [ ] LWC components deployed without errors
- [ ] Components visible in Lightning App Builder under "Custom"
- [ ] User ID configured on both components
- [ ] Marketing Score card shows score circle + grade on Account page
- [ ] Email Activity card shows email list with status badges
- [ ] Preview button opens modal with email HTML content
- [ ] Empty state shows gracefully for accounts with no data
- [ ] Score matches between React app and Salesforce LWC

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| "Configure the User ID property" message | User ID not set — edit the page in Lightning App Builder and enter your ISG Marketing User ID |
| Blank iframe / "Refused to frame" error | CSP Trusted Site not configured — add `https://isgmarketing-production.up.railway.app` with frame-src enabled |
| Components not in App Builder | Check meta.xml has `<isExposed>true</isExposed>` and targets `lightning__RecordPage` for `Account` |
| Iframe shows login page | User not authenticated in the app — ensure you're logged into ISG Marketing in the same browser |
| No data for an account | SF Account `Id` must match `account_unique_id` in Supabase `accounts` table |
| Iframe too short/tall | Adjust the `height` value in the component's CSS file and redeploy |
