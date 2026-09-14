-- Additive only: existing projects, client snapshots and share tokens are unchanged.
-- Inherits production_projects' existing staff-only RLS. Apply to staging first.
ALTER TABLE public.production_projects
  ADD COLUMN IF NOT EXISTS story text CHECK (char_length(story) <= 20000),
  ADD COLUMN IF NOT EXISTS script text CHECK (char_length(script) <= 40000),
  ADD COLUMN IF NOT EXISTS equipment text CHECK (char_length(equipment) <= 20000),
  ADD COLUMN IF NOT EXISTS shot_list text CHECK (char_length(shot_list) <= 20000),
  ADD COLUMN IF NOT EXISTS organization text CHECK (char_length(organization) <= 20000),
  ADD COLUMN IF NOT EXISTS vision_board_id uuid REFERENCES public.production_vision_boards(id) ON DELETE SET NULL;
