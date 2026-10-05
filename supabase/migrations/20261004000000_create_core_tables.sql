-- Migration: Create core tables for Airtable to Supabase migration
-- Date: 2026-10-04

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER,
  date_of_birth TEXT,
  year TEXT,
  college TEXT,
  company TEXT,
  designation TEXT,
  notes TEXT,
  initial_contact TEXT,
  last_contacted_on TEXT,
  address TEXT,
  location_ids TEXT[] DEFAULT '{}',
  assigned_preacher_id UUID,
  collected_by_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contacts_program_id ON contacts(program_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE UNIQUE INDEX idx_contacts_phone_program ON contacts(phone, program_id);

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_locations_program_id ON locations(program_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  name TEXT NOT NULL,
  session_date TEXT,
  preacher_id UUID,
  location_id UUID,
  public_attendance_enabled BOOLEAN DEFAULT false,
  attendance_opens_at TIMESTAMPTZ,
  attendance_closes_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  attendance_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_program_id ON sessions(program_id);
CREATE INDEX idx_sessions_session_date ON sessions(session_date);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_attendance_program_id ON attendance(program_id);
CREATE INDEX idx_attendance_contact_id ON attendance(contact_id);
CREATE INDEX idx_attendance_session_id ON attendance(session_id);
CREATE INDEX idx_attendance_created_at ON attendance(created_at);
CREATE UNIQUE INDEX idx_attendance_contact_session ON attendance(contact_id, session_id);

-- Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- RLS policies for contacts
CREATE POLICY "Contacts are viewable by authenticated users" ON contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Contacts can be inserted by service role" ON contacts
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Contacts can be updated by service role" ON contacts
  FOR UPDATE TO service_role USING (true);

-- RLS policies for locations
CREATE POLICY "Locations are viewable by authenticated users" ON locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Locations can be inserted by service role" ON locations
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Locations can be updated by service role" ON locations
  FOR UPDATE TO service_role USING (true);

-- RLS policies for sessions
CREATE POLICY "Sessions are viewable by authenticated users" ON sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sessions can be inserted by service role" ON sessions
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Sessions can be updated by service role" ON sessions
  FOR UPDATE TO service_role USING (true);

-- RLS policies for attendance
CREATE POLICY "Attendance is viewable by authenticated users" ON attendance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Attendance can be inserted by service role" ON attendance
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Attendance can be updated by service role" ON attendance
  FOR UPDATE TO service_role USING (true);
