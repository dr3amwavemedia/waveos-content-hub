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
  const accepted = Boolean(post && socialId !== "failed" && postStatus !== "error");

  const errors = Array.isArray(json.errors) ? (json.errors as AyrshareError[]) : [];
  const error = errors.find((entry) => entry.platform === platform) ?? errors[0];
  const topMessage = typeof json.message === "string" ? json.message : null;
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
      : topMessage ?? (!accepted ? `HTTP ${httpStatus}` : null),
  };
}
