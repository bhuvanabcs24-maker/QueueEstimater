-- ==========================================
-- SUPABASE / POSTGRES SCHEMA SETUP
-- Paste this into your Supabase SQL Editor
-- ==========================================

-- 1. Create Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Trigger to automatically create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone_number)
  VALUES (new.id, new.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Create Locations table
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  category TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geofence_radius_m INT DEFAULT 150, -- Threshold in meters
  avg_service_time_minutes INT DEFAULT 10, -- Minutes per person served
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Locations (public read, admin write)
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to locations" 
  ON public.locations FOR SELECT 
  USING (true);


-- 3. Create Queue Events table
CREATE TABLE IF NOT EXISTS public.queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT CHECK (event_type IN ('check_in', 'check_out', 'cancel')),
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Queue Events (read own events, insert verified events)
ALTER TABLE public.queue_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own queue events" 
  ON public.queue_events FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queue events" 
  ON public.queue_events FOR INSERT 
  WITH CHECK (auth.uid() = user_id);


-- 4. Create Location Estimates table
CREATE TABLE IF NOT EXISTS public.location_estimates (
  location_id UUID PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  current_queue_length INT DEFAULT 0,
  avg_wait_minutes NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Location Estimates (public read)
ALTER TABLE public.location_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to estimates" 
  ON public.location_estimates FOR SELECT 
  USING (true);


-- 5. Create Trigger for Auto-Recalculating Wait Estimates
CREATE OR REPLACE FUNCTION public.update_location_estimate()
RETURNS TRIGGER AS $$
DECLARE
  v_loc_id UUID;
  v_active_count INT;
  v_avg_service_time INT;
  v_wait_minutes NUMERIC;
BEGIN
  -- Determine location_id to update
  IF TG_OP = 'DELETE' THEN
    v_loc_id := OLD.location_id;
  ELSE
    v_loc_id := NEW.location_id;
  END IF;

  -- Get location service time
  SELECT COALESCE(avg_service_time_minutes, 10) INTO v_avg_service_time 
  FROM public.locations WHERE id = v_loc_id;

  -- Count active check-ins (latest event for user is 'check_in')
  WITH latest_user_events AS (
    SELECT DISTINCT ON (user_id)
      event_type
    FROM public.queue_events
    WHERE location_id = v_loc_id
    ORDER BY user_id, created_at DESC
  )
  SELECT COUNT(*) INTO v_active_count 
  FROM latest_user_events 
  WHERE event_type = 'check_in';

  -- Calculate average wait time (active check-ins * service time)
  v_wait_minutes := v_active_count * v_avg_service_time;

  -- Insert or update location_estimates
  INSERT INTO public.location_estimates (location_id, current_queue_length, avg_wait_minutes, last_updated)
  VALUES (v_loc_id, v_active_count, v_wait_minutes, NOW())
  ON CONFLICT (location_id) DO UPDATE
  SET current_queue_length = EXCLUDED.current_queue_length,
      avg_wait_minutes = EXCLUDED.avg_wait_minutes,
      last_updated = EXCLUDED.last_updated;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER queue_events_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.queue_events
  FOR EACH ROW EXECUTE FUNCTION public.update_location_estimate();


-- 6. Insert Mock Data for Testing
INSERT INTO public.locations (name, address, category, lat, lng, geofence_radius_m, avg_service_time_minutes)
VALUES 
  ('General Medicine Clinic A', '100 Medical Plaza, Suite 4', 'Clinic', 37.7749, -122.4194, 200, 12),
  ('Express Lab Services', '100 Medical Plaza, Suite 12', 'Laboratory', 37.7752, -122.4189, 100, 8),
  ('Pediatric Outpatient Clinic', '102 Medical Plaza, Floor 2', 'Pediatrics', 37.7745, -122.4201, 150, 15)
ON CONFLICT DO NOTHING;
