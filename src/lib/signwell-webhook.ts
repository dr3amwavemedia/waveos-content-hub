import { createHmac, timingSafeEqual } from "crypto";

export const SIGNWELL_EVENT_TOLERANCE_SECONDS = 300;

export type SignwellContractStatus =
  "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "void";

const terminalStatuses = new Set<SignwellContractStatus>(["signed", "declined", "expired", "void"]);

export const isTerminalSignwellContractStatus = (status: string) =>
  terminalStatuses.has(status.trim().toLowerCase() as SignwellContractStatus);

const activeStatusRank: Partial<Record<SignwellContractStatus, number>> = {
  draft: 0,
  sent: 1,
  viewed: 2,
};

const transitionSources: Record<SignwellContractStatus, SignwellContractStatus[]> = {
  draft: ["draft"],
  sent: ["draft", "sent"],
  viewed: ["draft", "sent", "viewed"],
  signed: ["draft", "sent", "viewed"],
  declined: ["draft", "sent", "viewed", "declined"],
  expired: ["draft", "sent", "viewed", "expired"],
  void: ["draft", "sent", "viewed", "void"],
};

export const isCompletedSignwellStatus = (status: string) =>
  ["completed", "manually completed", "manually_completed"].includes(status.trim().toLowerCase());

export function verifySignwellEvent(input: {
  eventType: string;
  eventTime: string;
  providedHash: string;
  webhookId: string;
  now?: number;
}): "valid" | "invalid_signature" | "stale_event" {
  if (!input.eventType || !input.eventTime || !input.providedHash) {
    return "invalid_signature";
  }

  const expected = createHmac("sha256", input.webhookId)
    .update(`${input.eventType}@${input.eventTime}`)
    .digest("hex");
  const provided = Buffer.from(input.providedHash, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
    return "invalid_signature";
  }

  const sentAt = Number.isFinite(Number(input.eventTime))
    ? Number(input.eventTime) * 1000
    : Date.parse(input.eventTime);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs((input.now ?? Date.now()) - sentAt) > SIGNWELL_EVENT_TOLERANCE_SECONDS * 1000
  ) {
    return "stale_event";
  }

  return "valid";
}

function localStatusForProviderStatus(providerStatus: string): SignwellContractStatus | null {
  switch (providerStatus.trim().toLowerCase()) {
    case "sending":
    case "sent":
    case "pending":
      return "sent";
    case "viewed":
      return "viewed";
    case "completed":
    case "manually completed":
    case "manually_completed":
      return "signed";
    case "declined":
      return "declined";
    case "expired":
      return "expired";
    case "canceled":
    case "cancelled":
      return "void";
    default:
      return null;
  }
}

/**
 * Translate SignWell's authenticated API state without allowing delayed events
 * to move a contract backwards or rewrite a terminal state.
 */
export function nextSignwellContractStatus(
  currentStatus: string,
  providerStatus: string,
): SignwellContractStatus | null {
  const current = currentStatus.trim().toLowerCase() as SignwellContractStatus;
  const target = localStatusForProviderStatus(providerStatus);
  if (!target) return null;
  if (isTerminalSignwellContractStatus(current)) return current;
  if (terminalStatuses.has(target)) return target;

  const currentRank = activeStatusRank[current] ?? -1;
  const targetRank = activeStatusRank[target] ?? -1;
  return targetRank >= currentRank ? target : current;
}

export function signwellTransitionSources(target: SignwellContractStatus) {
  return transitionSources[target];
}

export function signwellEventExternalId(input: {
  eventType: string;
  eventTime: string;
  documentId: string;
}) {
  return `${input.eventType}@${input.eventTime}:${input.documentId}`;
}

export function minimalSignwellEventPayload(input: {
  eventType: string;
  eventTime: string;
  documentId: string;
}) {
  return {
    event: { type: input.eventType, time: input.eventTime },
    data: { object: { id: input.documentId } },
  };
}
