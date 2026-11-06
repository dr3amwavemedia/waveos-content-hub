export type StoredAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12000;

/** Keep local conversation data bounded and reject malformed storage entries. */
export function sanitizeAgentMessages(value: unknown): StoredAgentMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (message): message is StoredAgentMessage =>
        typeof message === "object" &&
        message !== null &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.length <= MAX_MESSAGE_LENGTH,
    )
    .slice(-MAX_MESSAGES)
    .map(({ role, content }) => ({ role, content }));
}

/** Conversations are private to the signed-in user, even on a shared browser. */
export function agentConversationStorageKey(userId: string | null, workspaceId: string | null): string | null {
  if (!userId || !workspaceId) return null;
  return `waveos.assist.v2.${userId}.${workspaceId}`;
}
