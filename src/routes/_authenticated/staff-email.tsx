import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  FilePenLine,
  Forward,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/staff-email")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const db = supabase as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (table: string) => any;
    };
    const { data: role } = await db
      .from("user_roles")
      .select("id")
      .eq("user_id", data.user.id)
      .in("role", ["dream_wave_owner", "dream_wave_team"])
      .limit(1)
      .maybeSingle();
    if (!role) throw redirect({ to: "/home" });
  },
  component: StaffEmailPage,
  head: () => ({
    meta: [{ title: "Staff Email — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

type Folder = "inbox" | "sent" | "drafts" | "deleted";
type Address = { emailAddress?: { address?: string; name?: string } };
type Message = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  from?: Address;
  toRecipients?: Address[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  isDraft?: boolean;
};
type Contact = {
  id: string;
  accountId: string | null;
  name: string;
  business?: string;
  email: string;
  type: string;
};
type Attachment = { name: string; contentType: string; contentBytes: string };
type Compose = {
  mode: "send" | "reply" | "forward";
  messageId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
  accountId?: string | null;
  attachments: Attachment[];
};

async function api(fn: "outlook-mail" | "outlook-contacts", body?: Record<string, unknown>) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");
  const { data, error } = await supabase.functions.invoke(fn, {
    ...(body ? { body } : { method: "GET" as const }),
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const detail = await (error as { context?: Response }).context
      ?.json?.()
      .catch(() => null);
    throw new Error(detail?.error ?? error.message ?? "Email request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const blankCompose = (): Compose => ({
  mode: "send",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  message: "",
  attachments: [],
});

function StaffEmailPage() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [sending, setSending] = useState(false);
  const [showRecipientMatches, setShowRecipientMatches] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api("outlook-mail", { action: "list", folder });
      setMessages(result.messages ?? []);
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load mailbox");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [folder]);
  useEffect(() => {
    void api("outlook-contacts")
      .then((result) => setContacts(result.contacts ?? []))
      .catch(() => setContacts([]));
  }, []);

  const filtered = useMemo(() => {
    const value = search.toLowerCase().trim();
    if (!value) return messages;
    return messages.filter((message) =>
      [
        message.subject,
        message.bodyPreview,
        message.from?.emailAddress?.name,
        message.from?.emailAddress?.address,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(value)),
    );
  }, [messages, search]);

  const recipientTerm = compose?.to.split(",").at(-1)?.trim().toLowerCase() ?? "";
  const recipientMatches = recipientTerm.length
    ? contacts
        .filter((contact) =>
          [contact.name, contact.business, contact.email]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(recipientTerm)),
        )
        .slice(0, 8)
    : [];

  const openMessage = async (message: Message) => {
    try {
      const result = await api("outlook-mail", { action: "get", id: message.id });
      setSelected(result.message);
      if (!message.isRead) {
        void api("outlook-mail", { action: "mark", id: message.id, isRead: true });
        setMessages((items) =>
          items.map((item) => (item.id === message.id ? { ...item, isRead: true } : item)),
        );
      }
    } catch {
      toast.error("Could not open this message");
    }
  };

  const remove = async (message: Message) => {
    if (!window.confirm(`Delete “${message.subject || "this message"}”?`)) return;
    try {
      await api("outlook-mail", { action: "delete", id: message.id });
      setMessages((items) => items.filter((item) => item.id !== message.id));
      setSelected(null);
      toast.success(
        folder === "deleted" ? "Message permanently deleted" : "Message moved to Deleted Items",
      );
    } catch {
      toast.error("Could not delete message");
    }
  };

  const send = async (draft = false) => {
    if (!compose) return;
    setSending(true);
    try {
      const common = {
        to: compose.to
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        cc: compose.cc
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        bcc: compose.bcc
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        subject: compose.subject,
        message: compose.message,
        accountId: compose.accountId,
        attachments: compose.attachments,
      };
      if (compose.mode === "reply" && compose.messageId && !draft) {
        await api("outlook-mail", {
          action: "reply",
          id: compose.messageId,
          message: compose.message,
        });
      } else if (compose.mode === "forward" && compose.messageId && !draft) {
        await api("outlook-mail", { action: "forward", id: compose.messageId, ...common });
      } else {
        await api("outlook-mail", { action: draft ? "draft" : "send", ...common });
      }
      toast.success(draft ? "Draft saved in Outlook" : "Email sent from Outlook");
      setCompose(null);
      if (folder === "sent" || folder === "drafts") await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send email");
    } finally {
      setSending(false);
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!compose || !files) return;
    const additions: Attachment[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      if (file.size > 3 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 3 MB`);
        continue;
      }
      const contentBytes = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      additions.push({
        name: file.name,
        contentType: file.type || "application/octet-stream",
        contentBytes,
      });
    }
    setCompose({ ...compose, attachments: [...compose.attachments, ...additions] });
  };

  const folders: Array<{ id: Folder; label: string; icon: typeof Inbox }> = [
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "sent", label: "Sent", icon: Send },
    { id: "drafts", label: "Drafts", icon: FilePenLine },
    { id: "deleted", label: "Deleted", icon: Trash2 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Dream Wave staff
          </p>
          <h1 className="text-3xl font-semibold">Staff Email</h1>
          <p className="text-sm text-muted-foreground">
            Your private Outlook mailbox inside WaveOS.
          </p>
        </div>
        <Button onClick={() => setCompose(blankCompose())}>
          <Send className="mr-2 h-4 w-4" />
          Compose
        </Button>
      </div>
      <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-[170px_340px_1fr]">
        <aside className="border-b border-border p-3 lg:border-r lg:border-b-0">
          <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
            {folders.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setFolder(item.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${folder === item.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-elevated"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>
        <section className="border-b border-border lg:border-r lg:border-b-0">
          <div className="flex gap-2 border-b border-border p-3">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[590px] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-10">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No messages found.
              </div>
            ) : (
              filtered.map((message) => (
                <button
                  key={message.id}
                  onClick={() => void openMessage(message)}
                  className={`block w-full border-b border-border p-3 text-left hover:bg-elevated/60 ${selected?.id === message.id ? "bg-primary/10" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`truncate text-sm ${message.isRead ? "text-muted-foreground" : "font-semibold"}`}
                    >
                      {folder === "sent"
                        ? message.toRecipients?.[0]?.emailAddress?.address
                        : message.from?.emailAddress?.name ||
                          message.from?.emailAddress?.address ||
                          "Unknown"}
                    </span>
                    {message.hasAttachments && <Paperclip className="ml-auto h-3.5 w-3.5" />}
                  </div>
                  <p className={`mt-1 truncate text-sm ${message.isRead ? "" : "font-semibold"}`}>
                    {message.subject || "(no subject)"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {message.bodyPreview}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
        <section className="min-w-0 p-5">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Mail className="mb-3 h-12 w-12 text-primary" />
              <p>Select an email to read it.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selected.subject || "(no subject)"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    From:{" "}
                    {selected.from?.emailAddress?.name || selected.from?.emailAddress?.address}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCompose({
                        ...blankCompose(),
                        mode: "reply",
                        messageId: selected.id,
                        subject: `Re: ${selected.subject ?? ""}`,
                      })
                    }
                  >
                    <Reply className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCompose({
                        ...blankCompose(),
                        mode: "forward",
                        messageId: selected.id,
                        subject: `Fwd: ${selected.subject ?? ""}`,
                      })
                    }
                  >
                    <Forward className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      void api("outlook-mail", {
                        action: "mark",
                        id: selected.id,
                        isRead: !selected.isRead,
                      }).then(() => setSelected({ ...selected, isRead: !selected.isRead }))
                    }
                  >
                    {selected.isRead ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <MailOpen className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => void remove(selected)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap rounded-xl border border-border bg-elevated/35 p-5 text-sm leading-6">
                {selected.body?.content || selected.bodyPreview || "No message content."}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(compose)} onOpenChange={(open) => !open && setCompose(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {compose?.mode === "reply"
                ? "Reply"
                : compose?.mode === "forward"
                  ? "Forward"
                  : "New email"}
            </DialogTitle>
          </DialogHeader>
          {compose && (
            <div className="space-y-3">
              <div className="relative">
                <Label>To</Label>
                <Input
                  value={compose.to}
                  onFocus={() => setShowRecipientMatches(true)}
                  onChange={(event) => {
                    setCompose({ ...compose, to: event.target.value });
                    setShowRecipientMatches(true);
                  }}
                  placeholder="Type a lead, client, name, or email"
                />
                {showRecipientMatches && recipientMatches.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
                    {recipientMatches.map((contact) => (
                      <button
                        key={contact.id}
                        className="block w-full px-3 py-2 text-left hover:bg-elevated"
                        onClick={() => {
                          const parts = compose.to.split(",");
                          parts[parts.length - 1] = contact.email;
                          setCompose({
                            ...compose,
                            to: `${parts
                              .map((part) => part.trim())
                              .filter(Boolean)
                              .join(", ")}, `,
                            accountId: contact.accountId,
                          });
                          setShowRecipientMatches(false);
                        }}
                      >
                        <p className="text-sm font-medium">
                          {contact.name}{" "}
                          <span className="text-xs text-primary">{contact.type}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {contact.email}
                          {contact.business ? ` · ${contact.business}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>CC</Label>
                  <Input
                    value={compose.cc}
                    onChange={(event) => setCompose({ ...compose, cc: event.target.value })}
                  />
                </div>
                <div>
                  <Label>BCC</Label>
                  <Input
                    value={compose.bcc}
                    onChange={(event) => setCompose({ ...compose, bcc: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Subject</Label>
                <Input
                  value={compose.subject}
                  onChange={(event) => setCompose({ ...compose, subject: event.target.value })}
                />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  className="min-h-56"
                  value={compose.message}
                  onChange={(event) => setCompose({ ...compose, message: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4" />
                  Attach
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => void addFiles(event.target.files)}
                  />
                </label>
                {compose.attachments.map((attachment) => (
                  <span
                    key={attachment.name}
                    className="rounded-full bg-elevated px-2 py-1 text-xs"
                  >
                    {attachment.name}
                  </span>
                ))}
              </div>
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  disabled={sending || compose.mode !== "send"}
                  onClick={() => void send(true)}
                >
                  Save draft
                </Button>
                <Button
                  disabled={sending || (!compose.to.trim() && compose.mode !== "reply")}
                  onClick={() => void send(false)}
                >
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send email
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
