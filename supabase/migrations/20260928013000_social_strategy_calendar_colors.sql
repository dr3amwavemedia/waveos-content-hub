-- Monthly social planning plus shared and personal calendar colors.
-- New tables are workspace-scoped and additive; existing calendar/content data
-- is not rewritten.

CREATE TABLE IF NOT EXISTS public.social_strategy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  details text,
  item_kind text NOT NULL DEFAULT 'idea'
    CHECK (item_kind IN ('idea','campaign','product','promotion','launch','announcement')),
  status text NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea','planned','in_progress','awaiting_approval','scheduled','completed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high')),
  start_date date NOT NULL,
  end_date date,
  platforms text[] NOT NULL DEFAULT '{}',
  links text[] NOT NULL DEFAULT '{}',
  media_asset_ids uuid[] NOT NULL DEFAULT '{}',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS social_strategy_workspace_date_idx
  ON public.social_strategy_items(workspace_id, start_date, status);

CREATE TABLE IF NOT EXISTS public.calendar_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category_key text NOT NULL CHECK (category_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, category_key)
);

CREATE TABLE IF NOT EXISTS public.calendar_color_preferences (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category_key text NOT NULL CHECK (category_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, category_key)
);

CREATE OR REPLACE FUNCTION public.touch_social_planning_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_social_planning_row() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_social_planning_row() TO authenticated, service_role;

DROP TRIGGER IF EXISTS social_strategy_items_touch ON public.social_strategy_items;
CREATE TRIGGER social_strategy_items_touch
  BEFORE UPDATE ON public.social_strategy_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_planning_row();

DROP TRIGGER IF EXISTS calendar_categories_touch ON public.calendar_categories;
CREATE TRIGGER calendar_categories_touch
  BEFORE UPDATE ON public.calendar_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_planning_row();

ALTER TABLE public.social_strategy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_color_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_strategy_items, public.calendar_categories, public.calendar_color_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_strategy_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_color_preferences TO authenticated;
GRANT ALL ON public.social_strategy_items, public.calendar_categories, public.calendar_color_preferences TO service_role;

DROP POLICY IF EXISTS "authorized workspaces read strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces read strategy"
  ON public.social_strategy_items FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "authorized workspaces create strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces create strategy"
  ON public.social_strategy_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "authorized workspaces update strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces update strategy"
  ON public.social_strategy_items FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "authorized workspaces delete strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces delete strategy"
  ON public.social_strategy_items FOR DELETE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "workspace members read calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members read calendar categories"
  ON public.calendar_categories FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "workspace members create calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members create calendar categories"
  ON public.calendar_categories FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "workspace members update calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members update calendar categories"
  ON public.calendar_categories FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "workspace members delete custom calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members delete custom calendar categories"
  ON public.calendar_categories FOR DELETE TO authenticated
  USING (
    category_key NOT IN ('content','production','strategy')
    AND (
      public.has_role((SELECT auth.uid()), 'dream_wave_owner')
      OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
  );

DROP POLICY IF EXISTS "users manage their calendar colors" ON public.calendar_color_preferences;
CREATE POLICY "users manage their calendar colors"
  ON public.calendar_color_preferences FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.has_role((SELECT auth.uid()), 'dream_wave_owner')
      OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      public.has_role((SELECT auth.uid()), 'dream_wave_owner')
      OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
  );

INSERT INTO public.calendar_categories (workspace_id, category_key, name, color, sort_order)
SELECT workspace.id, defaults.category_key, defaults.name, defaults.color, defaults.sort_order
FROM public.workspaces AS workspace
CROSS JOIN (
  VALUES
    ('content', 'Social posts', '#38BDF8', 10),
    ('production', 'Productions', '#F59E0B', 20),
    ('strategy', 'Ideas & strategy', '#A78BFA', 30)
) AS defaults(category_key, name, color, sort_order)
ON CONFLICT (workspace_id, category_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_calendar_categories_for_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.calendar_categories (workspace_id, category_key, name, color, sort_order)
  VALUES
    (NEW.id, 'content', 'Social posts', '#38BDF8', 10),
    (NEW.id, 'production', 'Productions', '#F59E0B', 20),
    (NEW.id, 'strategy', 'Ideas & strategy', '#A78BFA', 30)
  ON CONFLICT (workspace_id, category_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_calendar_categories_for_workspace() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_calendar_categories_for_workspace() TO service_role;

DROP TRIGGER IF EXISTS workspaces_seed_calendar_categories ON public.workspaces;
CREATE TRIGGER workspaces_seed_calendar_categories
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_calendar_categories_for_workspace();
