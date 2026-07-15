# Car Event Tickets

Mobile-first camera QR scanner for the 200-ticket car event.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase project URL and publishable key.
3. Run `npm install` then `npm run dev`.

## Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The scanner asks staff for the scanner PIN, opens the rear camera, reads QR codes, and calls the `scan-ticket` Supabase Edge Function.
