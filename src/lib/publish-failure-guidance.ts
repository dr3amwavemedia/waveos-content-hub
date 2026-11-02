// Shared "What to check" guidance for failed publish attempts, used by both the
// Posts page and the social publish-results dialog so the copy cannot diverge.

type AttemptReference = {
  provider_post_id?: string | null;
  ayrshare_post_id?: string | null;
};

/** Refreshing provider details needs a stored provider post reference. */
export function hasProviderReference(attempt: AttemptReference) {
  return Boolean(attempt.provider_post_id || attempt.ayrshare_post_id);
}

const TIMEOUT = /zernio_timeout|aborted due to timeout|timed out|\btimeout\b|did not answer before/;
const NO_CAUSE = /without returning a detailed platform message|does not identify the content/;
const ACCOUNT = /connect|account|profile|authorization|authori[sz]ed|token|permission/;
const MEDIA =
  /\b(media|image|images|photo|video|videos|aspect ratio|duration|file size|size|format|resolution|dimensions?)\b/;
const CAPTION = /caption|text|character|hashtag|mention/;

export function failureGuidance(
  message: string | null,
  platform: string,
  options: { errorCode?: string | null; hasReference?: boolean } = {},
) {
  const error = `${options.errorCode ?? ""} ${message ?? ""}`.toLowerCase();
  if (TIMEOUT.test(error)) {
    return `This was a provider timeout, not a rejection of the vertical format or media. Zernio did not answer in time and may still be processing the post. Wait a few minutes, then use Open and retry post without changing or re-exporting the media. Networks that already succeeded will not be posted twice.`;
  }
  if (options.errorCode === "duplicate_guard") {
    return `WaveOS stopped this post before it reached ${platform} because the same caption and media were already published there from another post in the last 24 hours. Check the existing post first. To post a second copy on purpose, use Open and retry post and confirm Publish another copy.`;
  }
  if (NO_CAUSE.test(error)) {
    return options.hasReference === false
      ? `The provider did not identify a cause. Reopen this post and retry rather than changing content that already works on ${platform}.`
      : `The provider did not identify a cause. Refresh the provider details. If no additional reason appears, use the provider reference when contacting support rather than changing content that already works on ${platform}.`;
  }
  if (ACCOUNT.test(error)) {
    return `Reconnect ${platform} under Social accounts, confirm the correct profile is selected, then reopen this post and publish it again.`;
  }
  if (MEDIA.test(error)) {
    return `Review ${platform}'s media requirements. Adjust the file format, dimensions, duration, or size, then reopen this post and retry.`;
  }
  if (CAPTION.test(error)) {
    return `Review the ${platform} caption for unsupported mentions, hashtags, links, or length, then retry the post.`;
  }
  return `Confirm ${platform} is connected and permitted to publish, review the provider response above, then reopen this post and retry. Networks that already succeeded will not be posted twice.`;
}
