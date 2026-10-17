-- Add only missing WaveOS feature storage. No existing data, policies, billing or entitlements are changed.
-- New-table authorization mirrors the currently shipped feature UI without replacing has_feature.
CREATE FUNCTION public.waveos_foundation_feature_allowed(_workspace_id uuid, _feature text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.workspaces%ROWTYPE; p text; override_value jsonb;
BEGIN
 IF auth.uid() IS NULL OR _feature NOT IN ('can_view_analytics_checkup','can_use_creative_studio','can_use_campaign_manager','can_use_competitive_intelligence') THEN RETURN false; END IF;
 SELECT * INTO w FROM public.workspaces WHERE id = _workspace_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF w.data_source = 'os_data' THEN
  IF NOT public.social_subscription_is_active(_workspace_id) THEN RETURN false; END IF;
  IF _feature = 'can_view_analytics_checkup' THEN RETURN true; END IF;
  SELECT plan INTO p FROM public.workspace_social_subscriptions WHERE workspace_id = _workspace_id;
  RETURN p IN ('full','expanded');
 END IF;
 override_value := w.feature_overrides -> _feature;
 IF pg_catalog.jsonb_typeof(override_value) = 'boolean' THEN RETURN override_value::text::boolean; END IF;
 IF w.account_status IN ('suspended','archived','expired') OR (w.access_expires_at IS NOT NULL AND w.access_expires_at < now()) THEN RETURN false; END IF;
 IF _feature = 'can_view_analytics_checkup' THEN RETURN w.account_status = 'active'; END IF;
 RETURN w.access_tier::text IN ('retainer_full','social_management');
END;
$$;
REVOKE ALL ON FUNCTION public.waveos_foundation_feature_allowed(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waveos_foundation_feature_allowed(uuid,text) TO authenticated, service_role;
CREATE FUNCTION public.can_access_workspace_feature(_workspace_id uuid, _feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (public.can_staff_manage_workspace(auth.uid(),_workspace_id) OR (public.is_workspace_member(auth.uid(),_workspace_id) AND public.waveos_foundation_feature_allowed(_workspace_id,_feature)));
$$;
CREATE FUNCTION public.can_manage_workspace_feature(_workspace_id uuid, _feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (public.can_staff_manage_workspace(auth.uid(),_workspace_id) OR (public.waveos_foundation_feature_allowed(_workspace_id,_feature) AND coalesce(public.workspace_role(auth.uid(),_workspace_id)::text,'') IN ('owner','admin','editor')));
$$;
REVOKE ALL ON FUNCTION public.can_access_workspace_feature(uuid,text), public.can_manage_workspace_feature(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_workspace_feature(uuid,text), public.can_manage_workspace_feature(uuid,text) TO authenticated, service_role;

CREATE TABLE public.product_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version text NOT NULL UNIQUE CHECK(char_length(btrim(version)) BETWEEN 1 AND 40), title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160), summary text NOT NULL CHECK(char_length(btrim(summary)) BETWEEN 1 AND 500), body text NOT NULL DEFAULT '' CHECK(char_length(body)<=20000), published_at timestamptz,
 target_data_sources text[] NOT NULL DEFAULT '{}' CHECK(target_data_sources <@ ARRAY['client_data','os_data']::text[]), target_public_plans text[] NOT NULL DEFAULT '{}' CHECK(target_public_plans <@ ARRAY['trial','standard','full','expanded']::text[]), target_client_tiers text[] NOT NULL DEFAULT '{}' CHECK(target_client_tiers <@ ARRAY['project_client','growth_90','retainer_full','social_management','wedding_client']::text[]), target_workspace_roles text[] NOT NULL DEFAULT '{}' CHECK(target_workspace_roles <@ ARRAY['owner','admin','editor','approver','viewer']::text[]), link_url text CHECK(link_url IS NULL OR link_url ~ '^https://'), created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.product_releases TO authenticated;
GRANT ALL ON public.product_releases TO service_role;
ALTER TABLE public.product_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applicable releases are visible" ON public.product_releases FOR SELECT TO authenticated USING(public.has_role((SELECT auth.uid()),'dream_wave_owner') OR (published_at IS NOT NULL AND published_at<=now() AND (public.is_dream_wave_staff((SELECT auth.uid())) OR EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.workspaces w ON w.id=m.workspace_id LEFT JOIN public.workspace_social_subscriptions s ON s.workspace_id=w.id WHERE m.user_id=(SELECT auth.uid()) AND (cardinality(target_data_sources)=0 OR w.data_source=ANY(target_data_sources)) AND (w.data_source<>'os_data' OR cardinality(target_public_plans)=0 OR s.plan=ANY(target_public_plans)) AND (w.data_source='os_data' OR cardinality(target_client_tiers)=0 OR w.access_tier::text=ANY(target_client_tiers)) AND (cardinality(target_workspace_roles)=0 OR m.role::text=ANY(target_workspace_roles))))));
CREATE POLICY "owners manage releases" ON public.product_releases FOR ALL TO authenticated USING(public.has_role((SELECT auth.uid()),'dream_wave_owner')) WITH CHECK(public.has_role((SELECT auth.uid()),'dream_wave_owner'));

CREATE TABLE public.release_user_states (release_id uuid NOT NULL REFERENCES public.product_releases(id) ON DELETE CASCADE, user_id uuid NOT NULL DEFAULT auth.uid(), viewed_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz, dismissed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(release_id,user_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.release_user_states TO authenticated;
GRANT ALL ON public.release_user_states TO service_role;
ALTER TABLE public.release_user_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own release state" ON public.release_user_states FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY "users create applicable release state" ON public.release_user_states FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.product_releases r WHERE r.id=release_id));
CREATE POLICY "users update own release state" ON public.release_user_states FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY "users delete own release state" ON public.release_user_states FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE TABLE public.release_preferences (user_id uuid PRIMARY KEY DEFAULT auth.uid(), auto_show_releases boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.release_preferences TO authenticated;
GRANT ALL ON public.release_preferences TO service_role;
ALTER TABLE public.release_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own release preferences" ON public.release_preferences FOR ALL TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));

CREATE TABLE public.workflow_drafts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, user_id uuid NOT NULL DEFAULT auth.uid(), workflow_key text NOT NULL CHECK(workflow_key ~ '^[a-z][a-z0-9_-]{1,79}$'), entity_id uuid, payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(payload)='object') CHECK(octet_length(payload::text)<=262144), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workflow_drafts TO authenticated;
GRANT ALL ON public.workflow_drafts TO service_role;
ALTER TABLE public.workflow_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own authorized workflow drafts" ON public.workflow_drafts FOR ALL TO authenticated USING(user_id=(SELECT auth.uid()) AND (public.is_workspace_member((SELECT auth.uid()),workspace_id) OR public.can_staff_manage_workspace((SELECT auth.uid()),workspace_id))) WITH CHECK(user_id=(SELECT auth.uid()) AND (public.is_workspace_member((SELECT auth.uid()),workspace_id) OR public.can_staff_manage_workspace((SELECT auth.uid()),workspace_id)));

CREATE TABLE public.social_intelligence_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE, provider text NOT NULL DEFAULT 'zernio' CHECK(provider ~ '^[a-z][a-z0-9_-]{1,39}$'), sync_state text NOT NULL DEFAULT 'not_synced' CHECK(sync_state IN ('not_synced','syncing','available','partial','permission_missing','connection_expired','sync_failed','unsupported')), analyzed_sources text[] NOT NULL DEFAULT '{}', requested_range_start date, requested_range_end date, available_range_start date, available_range_end date, record_count integer NOT NULL DEFAULT 0 CHECK(record_count>=0), last_attempt_at timestamptz, last_success_at timestamptz, safe_error_code text, safe_error_message text CHECK(char_length(safe_error_message)<=500), metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object') CHECK(octet_length(metadata::text)<=131072), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,workspace_id), CHECK(requested_range_end IS NULL OR requested_range_start IS NULL OR requested_range_end>=requested_range_start), CHECK(available_range_end IS NULL OR available_range_start IS NULL OR available_range_end>=available_range_start));
GRANT SELECT ON public.social_intelligence_profiles TO authenticated;
GRANT ALL ON public.social_intelligence_profiles TO service_role;
ALTER TABLE public.social_intelligence_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read intelligence profiles" ON public.social_intelligence_profiles FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_view_analytics_checkup'));

CREATE TABLE public.social_intelligence_snapshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, profile_id uuid NOT NULL, metric_key text NOT NULL CHECK(metric_key ~ '^[a-z][a-z0-9_.-]{1,99}$'), provider text NOT NULL DEFAULT 'zernio' CHECK(provider ~ '^[a-z][a-z0-9_-]{1,39}$'), availability text NOT NULL CHECK(availability IN ('available','true_zero','not_synced','permission_missing','connection_expired','sync_failed','unsupported')), value numeric, unit text, range_start date, range_end date, record_count integer NOT NULL DEFAULT 0 CHECK(record_count>=0), captured_at timestamptz NOT NULL DEFAULT now(), source_reference text, calculation_version text, evidence jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(evidence)='object') CHECK(octet_length(evidence::text)<=131072), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(profile_id,workspace_id) REFERENCES public.social_intelligence_profiles(id,workspace_id) ON DELETE CASCADE, CHECK(range_end IS NULL OR range_start IS NULL OR range_end>=range_start), CHECK((availability='available' AND value IS NOT NULL AND value<>0) OR (availability='true_zero' AND value=0) OR (availability NOT IN ('available','true_zero') AND value IS NULL)));
GRANT SELECT ON public.social_intelligence_snapshots TO authenticated;
GRANT ALL ON public.social_intelligence_snapshots TO service_role;
ALTER TABLE public.social_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read intelligence snapshots" ON public.social_intelligence_snapshots FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_view_analytics_checkup'));

CREATE TABLE public.creative_designs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, created_by uuid NOT NULL DEFAULT auth.uid(), name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 180), format text NOT NULL CHECK(format ~ '^[a-z][a-z0-9_-]{1,59}$'), document jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(document)='object') CHECK(octet_length(document::text)<=1048576), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.creative_designs TO authenticated;
GRANT ALL ON public.creative_designs TO service_role;
ALTER TABLE public.creative_designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read designs" ON public.creative_designs FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_use_creative_studio'));
CREATE POLICY "editors create designs" ON public.creative_designs FOR INSERT TO authenticated WITH CHECK(created_by=(SELECT auth.uid()) AND public.can_manage_workspace_feature(workspace_id,'can_use_creative_studio'));
CREATE POLICY "editors update designs" ON public.creative_designs FOR UPDATE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_creative_studio')) WITH CHECK(public.can_manage_workspace_feature(workspace_id,'can_use_creative_studio'));
CREATE POLICY "editors delete designs" ON public.creative_designs FOR DELETE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_creative_studio'));

CREATE TABLE public.campaign_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, created_by uuid NOT NULL DEFAULT auth.uid(), name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 180), goal text NOT NULL DEFAULT '' CHECK(char_length(goal)<=2000), start_date date NOT NULL, end_date date NOT NULL, platforms text[] NOT NULL DEFAULT '{}', max_posts integer NOT NULL DEFAULT 12 CHECK(max_posts BETWEEN 1 AND 500), posting_hours text[] NOT NULL DEFAULT '{}', excluded_days text[] NOT NULL DEFAULT '{}' CHECK(excluded_days <@ ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[]), approval_required boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','approved','scheduled','completed','archived')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,workspace_id), CHECK(end_date>=start_date));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaign_plans TO authenticated;
GRANT ALL ON public.campaign_plans TO service_role;
ALTER TABLE public.campaign_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read campaign plans" ON public.campaign_plans FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_use_campaign_manager'));
CREATE POLICY "editors create campaign plans" ON public.campaign_plans FOR INSERT TO authenticated WITH CHECK(created_by=(SELECT auth.uid()) AND public.can_manage_workspace_feature(workspace_id,'can_use_campaign_manager'));
CREATE POLICY "editors update campaign plans" ON public.campaign_plans FOR UPDATE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_campaign_manager')) WITH CHECK(public.can_manage_workspace_feature(workspace_id,'can_use_campaign_manager'));
CREATE POLICY "editors delete campaign plans" ON public.campaign_plans FOR DELETE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_campaign_manager'));

CREATE TABLE public.campaign_plan_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, campaign_plan_id uuid NOT NULL, position integer NOT NULL DEFAULT 0 CHECK(position>=0), planned_date date, planned_time time, platform text, content_pillar text CHECK(char_length(content_pillar)<=160), working_title text CHECK(char_length(working_title)<=240), copy_brief text CHECK(char_length(copy_brief)<=10000), approval_required boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','approved','scheduled','skipped','completed')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(campaign_plan_id,workspace_id) REFERENCES public.campaign_plans(id,workspace_id) ON DELETE CASCADE, UNIQUE(campaign_plan_id,position));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaign_plan_items TO authenticated;
GRANT ALL ON public.campaign_plan_items TO service_role;
ALTER TABLE public.campaign_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read campaign items" ON public.campaign_plan_items FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_use_campaign_manager'));
CREATE POLICY "editors manage campaign items" ON public.campaign_plan_items FOR ALL TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_campaign_manager')) WITH CHECK(public.can_manage_workspace_feature(workspace_id,'can_use_campaign_manager'));

CREATE TABLE public.competitors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, created_by uuid NOT NULL DEFAULT auth.uid(), name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 180), website_url text CHECK(website_url IS NULL OR website_url ~ '^https://'), social_handles jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(social_handles)='object') CHECK(octet_length(social_handles::text)<=32768), notes text CHECK(char_length(notes)<=10000), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,workspace_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read competitors" ON public.competitors FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_use_competitive_intelligence'));
CREATE POLICY "editors create competitors" ON public.competitors FOR INSERT TO authenticated WITH CHECK(created_by=(SELECT auth.uid()) AND public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence'));
CREATE POLICY "editors update competitors" ON public.competitors FOR UPDATE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence')) WITH CHECK(public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence'));
CREATE POLICY "editors delete competitors" ON public.competitors FOR DELETE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence'));

CREATE TABLE public.competitive_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, competitor_id uuid NOT NULL, created_by uuid NOT NULL DEFAULT auth.uid(), title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 200), metrics jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(metrics)='array') CHECK(octet_length(metrics::text)<=262144), score numeric CHECK(score BETWEEN 0 AND 100), confidence numeric CHECK(confidence BETWEEN 0 AND 1), methodology text NOT NULL DEFAULT 'WaveOS-defined' CHECK(char_length(btrim(methodology)) BETWEEN 1 AND 10000), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(competitor_id,workspace_id) REFERENCES public.competitors(id,workspace_id) ON DELETE RESTRICT);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.competitive_reports TO authenticated;
GRANT ALL ON public.competitive_reports TO service_role;
ALTER TABLE public.competitive_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorized workspaces read reports" ON public.competitive_reports FOR SELECT TO authenticated USING(public.can_access_workspace_feature(workspace_id,'can_use_competitive_intelligence'));
CREATE POLICY "editors create reports" ON public.competitive_reports FOR INSERT TO authenticated WITH CHECK(created_by=(SELECT auth.uid()) AND public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence'));
CREATE POLICY "editors update reports" ON public.competitive_reports FOR UPDATE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence')) WITH CHECK(public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence'));
CREATE POLICY "editors delete reports" ON public.competitive_reports FOR DELETE TO authenticated USING(public.can_manage_workspace_feature(workspace_id,'can_use_competitive_intelligence'));

CREATE INDEX product_releases_published_idx ON public.product_releases(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX release_user_states_user_idx ON public.release_user_states(user_id,acknowledged_at,dismissed_at);
CREATE UNIQUE INDEX workflow_drafts_identity_key ON public.workflow_drafts(workspace_id,user_id,workflow_key,coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX workflow_drafts_user_updated_idx ON public.workflow_drafts(user_id,updated_at DESC);
CREATE INDEX social_intelligence_snapshots_workspace_metric_idx ON public.social_intelligence_snapshots(workspace_id,metric_key,captured_at DESC);
CREATE INDEX social_intelligence_snapshots_profile_range_idx ON public.social_intelligence_snapshots(profile_id,range_start,range_end);
CREATE INDEX creative_designs_workspace_updated_idx ON public.creative_designs(workspace_id,updated_at DESC);
CREATE INDEX campaign_plans_workspace_dates_idx ON public.campaign_plans(workspace_id,start_date,end_date);
CREATE INDEX campaign_plan_items_workspace_date_idx ON public.campaign_plan_items(workspace_id,planned_date,position);
CREATE INDEX competitors_workspace_name_idx ON public.competitors(workspace_id,name);
CREATE INDEX competitive_reports_workspace_created_idx ON public.competitive_reports(workspace_id,created_at DESC);
CREATE TRIGGER product_releases_updated_at BEFORE UPDATE ON public.product_releases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER release_user_states_updated_at BEFORE UPDATE ON public.release_user_states FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER release_preferences_updated_at BEFORE UPDATE ON public.release_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER workflow_drafts_updated_at BEFORE UPDATE ON public.workflow_drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER social_intelligence_profiles_updated_at BEFORE UPDATE ON public.social_intelligence_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER creative_designs_updated_at BEFORE UPDATE ON public.creative_designs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER campaign_plans_updated_at BEFORE UPDATE ON public.campaign_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER campaign_plan_items_updated_at BEFORE UPDATE ON public.campaign_plan_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER competitors_updated_at BEFORE UPDATE ON public.competitors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER competitive_reports_updated_at BEFORE UPDATE ON public.competitive_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
NOTIFY pgrst, 'reload schema';