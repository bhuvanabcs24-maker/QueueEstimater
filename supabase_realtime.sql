-- ==========================================
-- ENABLE REALTIME ON location_estimates
-- Run this in Supabase SQL Editor
-- ==========================================

-- This tells Supabase's Realtime engine to broadcast
-- changes to the location_estimates table over WebSockets.
-- The trigger on queue_events already auto-updates this table,
-- so subscribing here gives you instant push on every check-in/out/cancel.

ALTER PUBLICATION supabase_realtime ADD TABLE public.location_estimates;
