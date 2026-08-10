export type AyrsharePostResult = {
  accepted: boolean;
  pending: boolean;
  ayrshareId: string | null;
  socialPostId: string | null;
  postUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type AyrshareError = {
  code?: string | number;
  message?: string;
  details?: string;
  platform?: string;
};

function asError(value: unknown): AyrshareError | null {
  if (typeof value === "string") return { message: value };
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === "string" || typeof record.code === "number" ? record.code : undefined,
    message: typeof record.message === "string"
      ? record.message
      : typeof record.error === "string"
        ? record.error
        : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    platform: typeof record.platform === "string" ? record.platform : undefined,
  };
}

type AyrsharePostId = {
  id?: string;
  platform?: string;
  postUrl?: string;
  status?: string;
};

export function parseAyrsharePostResponse(
  json: Record<string, unknown>,
  platform: string,
  httpStatus: number,
): AyrsharePostResult {
  const postIds = Array.isArray(json.postIds) ? (json.postIds as AyrsharePostId[]) : [];
  const post = postIds.find((entry) => entry.platform === platform) ?? postIds[0];
  const socialId = typeof post?.id === "string" ? post.id : null;
  const postStatus = String(post?.status ?? "").toLowerCase();
  const pending = socialId === "pending" || postStatus === "pending";
  const historyStatus = String(json.status ?? "").toLowerCase();
  const accepted = Boolean(
    (post && socialId !== "failed" && postStatus !== "error")
      || (!post && ["success", "published", "pending"].includes(historyStatus)),
  );

  const errors = Array.isArray(json.errors)
    ? json.errors.map(asError).filter((entry): entry is AyrshareError => Boolean(entry))
    : [];
  const alternateError = asError(json.error) ?? asError(json.details) ?? asError(json.data);
  const error = errors.find((entry) => entry.platform === platform) ?? errors[0] ?? alternateError;
  const topMessage = typeof json.message === "string"
    ? json.message
    : typeof json.error === "string"
      ? json.error
      : null;
  const detail = error?.details ? ` ${error.details}` : "";

  return {
    accepted,
    pending,
    ayrshareId: typeof json.id === "string" ? json.id : null,
    socialPostId: socialId,
    postUrl: typeof post?.postUrl === "string" ? post.postUrl : null,
    errorCode: error?.code == null ? null : String(error.code),
    errorMessage: error?.message
      ? `${error.message}${detail}`
      : topMessage
        ?? (!accepted
          ? `Ayrshare rejected the ${platform} request (HTTP ${httpStatus}) without returning a detailed platform message. Check the media format and Ayrshare Action history for this attempt.`
          : null),
  };
}
