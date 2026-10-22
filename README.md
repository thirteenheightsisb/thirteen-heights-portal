# 13 Heights Management Portal — Setup Guide

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
1. github.com → **+** → **New repository** → name it `thirteen-heights-portal` → **Private** → **Create repository**.
2. Click **uploading an existing file**.
3. Open the unzipped `thirteen-heights-portal` folder, select **everything inside it** (package.json, src, supabase, index.html, …) and drag it in.
   `package.json` must be at the top level of the repository, not inside another folder.
4. **Commit changes**.

## 3. Website (Cloudflare Pages)
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git** / **Import an existing Git repository**.
2. Connect GitHub and choose `thirteen-heights-portal`.
3. Build settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** → add two:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your publishable / anon key
5. **Save and Deploy**. After ~2 minutes you get a link like `thirteen-heights-portal.pages.dev`.

## 4. First use
1. Open your link → **Create an account**. The FIRST account becomes the **Admin**.
2. **Settings** → enter building name, address, phone, invoice note.
3. **Flats** → **Add several** (e.g. floor 1, 101 to 110, rent).
4. Click a vacant flat → **Add resident** → enter rent and the **monthly maintenance charges** for that resident.
5. Every month: **Monthly billing** → **Add rent** → **Add maintenance** → **Invoices** → download all.
   The Dashboard shows what is to be billed this month, and rent / maintenance to collect and collected.
6. **Portal users** → **Add user** for your staff.

## Owner payouts (paying the actual flat owners)
1. **Owner payouts** → on each flat press **Owner details** → enter owner name, phone, bank account and the amount you pay them each month.
2. When you pay an owner, press **Pay** on that flat (or **+ Record payout**). Fill in the amount, method, the **account it was paid into**, transaction ID and any **note**.
3. The top of the page shows, for the chosen month: rent collected, owed to owners, paid to owners and still to pay.
4. **Download Excel** in Payout history gives you a record of every payout with its account details and notes. **Send** shares the payout details with the owner on WhatsApp.

*Already set up before this feature?* Run `supabase/owner_payouts.sql` once in the Supabase SQL Editor.

## Maintenance charges (replaces electricity / utility bills)
1. Each resident has a **Maintenance charges (per month)** amount, set on their details form next to the rent.
2. **Monthly billing** → the **Maintenance charges** section lists every active resident with that amount pre-filled. Change any amount for this month if needed (or set 0 to skip) and press **Add maintenance**. Rent and maintenance appear as separate lines on the invoice.
3. Payments are recorded as before (one amount per resident). On the Dashboard a resident's payments for the month count towards their rent first, then their maintenance.

*Already set up before this feature?* Run `supabase/maintenance.sql` once in the Supabase SQL Editor. Old electricity bills already entered are kept in the ledger as "Electricity / utilities (old)".

## Good habits
- **Settings → Download full backup** once a week (free plan has no automatic backups).
- Free Supabase projects pause after ~7 days with no use. If the portal says it can't reach the database, open Supabase and press **Restore project**.

## Changing code later
Edit files on GitHub (pencil icon) → Commit. Cloudflare rebuilds the site automatically.
If you add or change the environment variables, go to Cloudflare → your project → **Deployments** → **Retry deployment**.
