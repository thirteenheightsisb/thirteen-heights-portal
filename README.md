# Hostel Portal — Setup Guide

Free stack: **Supabase** (database + logins) and **Cloudflare Pages** (website).

## 1. Database (Supabase)
1. supabase.com → **New project** → region **Singapore** or **Mumbai**. Wait ~2 minutes.
2. **Authentication → Sign In / Providers → Email** → turn **off** "Confirm email" → Save.
3. **SQL Editor** → **New query** → paste everything from `supabase/schema.sql` → **Run**.
   You should see "Success. No rows returned".
4. Click **Connect** (top of the page) or go to **Project Settings → API Keys**. Copy:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **Publishable key** (starts with `sb_publishable_`) — or the legacy **anon public** key.

## 2. Code (GitHub)
1. github.com → **+** → **New repository** → name it `hostel-portal` → **Private** → **Create repository**.
2. Click **uploading an existing file**.
3. Open the unzipped `hostel-portal` folder, select **everything inside it** (package.json, src, supabase, index.html, …) and drag it in.
   `package.json` must be at the top level of the repository, not inside another folder.
4. **Commit changes**.

## 3. Website (Cloudflare Pages)
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git** / **Import an existing Git repository**.
2. Connect GitHub and choose `hostel-portal`.
3. Build settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** → add two:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your publishable / anon key
5. **Save and Deploy**. After ~2 minutes you get a link like `hostel-portal.pages.dev`.

## 4. First use
1. Open your link → **Create an account**. The FIRST account becomes the **Admin**.
2. **Settings** → enter hostel name, address, phone, invoice note.
3. **Flats** → **Add several** (e.g. floor 1, 101 to 110, rent).
4. Click a vacant flat → **Add resident**.
5. Every month: **Monthly billing** → add rent → enter electricity bills → **Invoices** → download all.
6. **Portal users** → **Add user** for your staff.

## Good habits
- **Settings → Download full backup** once a week (free plan has no automatic backups).
- Free Supabase projects pause after ~7 days with no use. If the portal says it can't reach the database, open Supabase and press **Restore project**.

## Changing code later
Edit files on GitHub (pencil icon) → Commit. Cloudflare rebuilds the site automatically.
If you add or change the environment variables, go to Cloudflare → your project → **Deployments** → **Retry deployment**.
