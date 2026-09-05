# Mentoring Platform Feedback Booth

A beautiful, single-screen experience to collect high-quality product feedback for the Mentoring Platform.

## Features

- **Voice-first Feedback**: Collects 30-second audio feedback with transcriptions.
- **Kiosk Mode**: Single-page flow with auto-reset functionality.
- **Admin Dashboard**: View metrics, play audio responses, and export data as CSV.
- **Supabase Integration**: Stores responses in a PostgreSQL database and audio files in a storage bucket.

## Tech Stack

- Next.js (App Router)
- Tailwind CSS
- shadcn/ui & Framer Motion
- Supabase (DB + Storage)
- Recharts (Admin Analytics)

## Environment Variables

Create a `.env.local` file and add the following:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ADMIN_PASSWORD=your_admin_password
```

## Setup

1. Run `npm install` to install dependencies.
2. Setup Supabase:
   - Run the SQL schema from `schema.sql` in your Supabase SQL editor.
   - Create a storage bucket called `voice-feedback`.
3. Run the development server with `npm run dev`.
4. Access the feedback booth at `http://localhost:3000`.
5. Access the admin dashboard at `http://localhost:3000/admin`.

## Deployment

Deploy this project on Vercel by linking the GitHub repository and adding the environment variables in the Vercel dashboard.
