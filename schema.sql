-- Create feedback_responses table
CREATE TABLE feedback_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  role TEXT NOT NULL,
  ease_rating TEXT NOT NULL,
  struggle_area TEXT NOT NULL,
  transcript TEXT,
  audio_url TEXT,
  duration_seconds INTEGER,
  device_id TEXT
);

-- Enable RLS for the table
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts to the feedback_responses table
CREATE POLICY "Allow anonymous inserts" ON feedback_responses
  FOR INSERT WITH CHECK (true);

-- Allow public reads for admin purposes (optional, could restrict by admin role if using Supabase Auth)
CREATE POLICY "Allow public read" ON feedback_responses
  FOR SELECT USING (true);

-- Storage bucket creation:
-- Go to the Storage section of your Supabase dashboard and create a public bucket named 'voice-feedback'
-- Then run the following to allow anonymous uploads:

-- Allow anonymous uploads to voice-feedback bucket
CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'voice-feedback');

-- Allow public read of voice-feedback files
CREATE POLICY "Allow public read of files" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'voice-feedback');
