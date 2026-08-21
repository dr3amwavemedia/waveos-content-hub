ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS client_name text;