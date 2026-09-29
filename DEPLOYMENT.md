# MikeHunt Deployment Guide

## ✅ Local Development Setup - COMPLETED

### 1. Supabase Local Development
The local Supabase instance is now running:

- **Studio**: http://127.0.0.1:54323
- **API URL**: http://127.0.0.1:54321
- **Database**: postgresql://postgres:postgres@127.0.0.1:54322/postgres

### 2. Environment Variables
The `.env` file has been created with local Supabase credentials.

### 3. Running the Development Server
The app is now running at: http://localhost:3000

**Status**: ✅ Local development environment is fully functional

## Production Deployment (Vercel)

### Prerequisites
1. Vercel account (create at https://vercel.com)
2. Supabase project (create at https://supabase.com)
3. Complete Vercel CLI authentication

### ⏳ Step 0: Complete Vercel CLI Authentication
**Status**: Pending - Requires manual browser authentication

To complete Vercel authentication:
1. Run `vercel login` in your terminal
2. Visit the provided OAuth URL in your browser
3. Complete the authentication flow
4. Return to terminal to confirm success

### Step 1: Set up Supabase Production Project

1. Go to https://supabase.com and create a new project
2. Wait for the project to be provisioned
3. Get your project credentials:
   - Project URL
   - Anon key (public)
   - Service role key (secret)

### Step 2: Link Project to Vercel

```bash
vercel login
vercel link
```

### Step 3: Configure Environment Variables in Vercel

In your Vercel project dashboard, add these environment variables:

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `CRON_SECRET` - Generate a random secret for cron jobs
- `INGEST_SECRET` - Generate a random secret for browser extension
- `SCRAPE_SECRET` - Generate a random secret for scrape API

**Optional:**
- `GOOGLE_GENERATIVE_AI_API_KEY` - For AI features
- `RESEND_API_KEY` - For email notifications
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - For SMS
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - For billing
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - For billing
- `SENTRY_DSN` - For error tracking

### Step 4: Deploy Database Migrations

```bash
# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to production
supabase db push
```

### Step 5: Deploy to Vercel

```bash
vercel --prod
```

### Step 6: Configure Cron Jobs

The `vercel.json` file already includes cron job configurations:
- `/api/alerts/profit-sniper` - Every 10 minutes
- `/api/alerts/process` - Every 15 minutes
- `/api/embeddings/backfill` - Every 6 hours

These will be automatically configured when you deploy.

## Post-Deployment Steps

1. **Test Authentication**: Sign up for a new account to verify auth works
2. **Test Database**: Verify Supabase connection is working
3. **Test Scrapers**: Run a scrape job to verify data ingestion
4. **Configure Email/SMS**: Set up Resend and Twilio if needed
5. **Set up Billing**: Configure Stripe if you want to enable paid features

## Troubleshooting

### Supabase Local Issues
```bash
# Reset local Supabase
supabase stop
supabase start
```

### Database Migration Issues
```bash
# Check migration status
supabase db diff

# Reset database (WARNING: deletes all data)
supabase db reset
```

### Vercel Build Issues
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify Node.js version (requires >= 20)

## Migration Files — security hardening RESOLVED

The two migrations that were previously backed up as `.bak` (missing-function
errors on fresh databases) have been replaced by:

- `20260929000000_security_hardening_idempotent.sql` — same advisor fixes
  (view `security_invoker`, pinned `search_path`, targeted `REVOKE`s), rewritten
  as data-driven, existence-guarded, idempotent DO-blocks.

`supabase db push` no longer needs any manual workarounds.

## What's Been Accomplished

✅ **Local Supabase Setup**
- Supabase CLI installed and configured
- Local development environment running
- Database migrations applied successfully
- Studio accessible at http://127.0.0.1:54323

✅ **Application Setup**
- Environment variables configured for local development
- Next.js development server running at http://localhost:3000
- Database connection established
- Application is responding to requests

✅ **Project Structure**
- All necessary dependencies installed
- Migration files organized and functional
- Configuration files properly set up

## Next Steps for Production Deployment

1. **Complete Vercel Authentication** (Manual step required)
   - Run `vercel login` and complete browser authentication

2. **Create Supabase Production Project**
   - Sign up at https://supabase.com
   - Create a new project
   - Wait for provisioning
   - Get credentials (URL, anon key, service role key)

3. **Link and Deploy**
   - Run `vercel link` to connect project
   - Configure environment variables in Vercel dashboard
   - Run `supabase link --project-ref YOUR_PROJECT_REF`
   - Run `supabase db push` to deploy migrations
   - Run `vercel --prod` to deploy application

## Current Status

**Local Development**: ✅ Fully operational
**Production Deployment**: ⏳ Awaiting manual authentication and project setup
