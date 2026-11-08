-- Migration: contacts.attachments for course-registration payment screenshots
-- Date: 2026-11-08
-- Public course registrations upload a payment screenshot. The file lives in a
-- private Storage bucket; the contact row keeps the pointer and its metadata.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('gita-life-payment-screenshots', 'gita-life-payment-screenshots', false)
ON CONFLICT (id) DO NOTHING;
