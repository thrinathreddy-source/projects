-- Migration: add the demographic columns app code already expects on `users`.
--
-- Without this, api/auth/register silently falls back to a bare-bones insert
-- (id, name, looking_for, phone_encrypted only) whenever it hits a "column does
-- not exist" error — which means every registered user's gender/dob/city/
-- religion/mother_tongue/profession/institution/quirky_fact has been silently
-- discarded. The real Friday matching cron (api/match/find) selects these same
-- columns and will fail the same way when it runs.
--
-- Run this once in the Supabase SQL editor for this project, then re-register
-- a test account to confirm the full insert path succeeds (no more fallback).

alter table public.users
  add column if not exists dob            date,
  add column if not exists gender         text,
  add column if not exists height         text,
  add column if not exists city           text,
  add column if not exists religion       text,
  add column if not exists profession     text,
  add column if not exists mother_tongue  text,
  add column if not exists institution    text,
  add column if not exists quirky_fact    text;
