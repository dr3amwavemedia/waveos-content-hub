-- Preserve provider-native repost counts instead of folding them into shares.
-- Both storyViews spellings remain accepted for compatibility with the initial
-- migration and the normalized writer used by the application.
ALTER TABLE public.social_post_metric_observations
  DROP CONSTRAINT IF EXISTS social_post_metric_observations_metric_key_check;

ALTER TABLE public.social_post_metric_observations
  ADD CONSTRAINT social_post_metric_observations_metric_key_check
  CHECK (metric_key IN (
    'followers', 'impressions', 'reach', 'likes', 'comments', 'shares',
    'reposts', 'saves', 'clicks', 'messages', 'views', 'storyViews', 'story_views'
  ));
