# Email Automation App

Email automation platform for insurance agencies. Built with React, Vite, Supabase, and React Query.

## Features

- **Dashboard** - Overview stats, upcoming emails, performance comparison
- **Automations** - Create and manage automated email workflows
- **Templates** - Email template CRUD with merge field support
- **Clients** - Client database with policy info and email history
- **Settings** - Email signature, agency info, integrations

## Tech Stack

- **Frontend**: React 18, React Router 6, React Query 5
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Styling**: Inline styles with theme support (dark/light)
- **Build**: Vite 5
- **Hosting**: Railway

## Local Development

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

3. Install dependencies:

```bash
npm install
```

4. Start the development server:

```bash
npm run dev
```

5. Open http://localhost:5173

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key |
| `VITE_APP_URL` | Your deployed app URL (for unsubscribe links) |

## Railway Deployment

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables in Railway dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL`
4. Deploy!

Railway will automatically:
- Detect the Vite/React app
- Run `npm install && npm run build`
- Serve the built app using `serve`

## Database Setup

1. Create a new Supabase project
2. Run the schema file in the SQL editor:
   - `database/email-automation-complete-schema.sql`
3. Run any migrations:
   - `database/migrations/001_automations_default_inactive.sql`

## Project Structure

```
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Main app with routing
│   ├── lib/
│   │   ├── supabase.js   # Supabase client
│   │   └── queryClient.js # React Query client
│   ├── services/         # Supabase API functions
│   ├── hooks/            # React Query hooks
│   ├── pages/            # Page components
│   └── providers/        # Context providers
├── database/
│   ├── email-automation-complete-schema.sql
│   └── migrations/
├── public/
│   └── favicon.svg
├── index.html
├── package.json
├── vite.config.js
├── railway.json          # Railway config
├── serve.json            # SPA routing config
└── .env.example
```

## URL Structure

All routes are nested under the user ID (Salesforce format):

- `/` - Redirects to demo user
- `/:userId/dashboard` - Main dashboard
- `/:userId/automations` - Automation list
- `/:userId/automations/new` - Create automation
- `/:userId/automations/:id` - Edit automation
- `/:userId/templates` - Template management
- `/:userId/mass-email` - One-off email sends
- `/:userId/clients` - Client list
- `/:userId/clients/:accountId` - Client profile
- `/:userId/settings` - User settings
- `/:userId/timeline` - Admin activity view

## Next Steps (Phase 3+)

- [ ] SendGrid integration for actual email sending
- [ ] Automation engine (filter evaluation, scheduling)
- [ ] Webhook endpoint for email events
- [ ] Mass email with FilterBuilder
- [ ] WorkflowBuilder integration
