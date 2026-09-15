import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Loader2, Plus, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";

type ReceiptRow = {
  id: string;
  vendor: string;
  note: string | null;
  amount_cents: number;
  currency: string;
  spent_on: string;
  shared_with_client: boolean;
  shared_at: string | null;
};

const inputCls =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/** Expense receipts are private to the team until explicitly shared. */
export function ExpenseReceiptsPanel({
  workspaceId,
  clientName,
}: {
  workspaceId: string;
  clientName: string;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["expense-receipts", workspaceId],
    queryFn: async (): Promise<ReceiptRow[]> => {
      const { data, error } = await supabase
        .from("expense_receipts")
        .select("id,vendor,note,amount_cents,currency,spent_on,shared_with_client,shared_at")
        .eq("workspace_id", workspaceId)
        .order("spent_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReceiptRow[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["expense-receipts", workspaceId] });

  const add = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amount) * 100);
      if (!vendor.trim()) throw new Error("Add the vendor name.");
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Add a valid amount.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("expense_receipts").insert({
        workspace_id: workspaceId,
        vendor: vendor.trim(),
        note: note.trim() || null,
        amount_cents: cents,
        spent_on: spentOn,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAdding(false);
      setVendor("");
      setAmount("");
      setNote("");
      await refresh();
      toast.success("Receipt saved. It stays private to your team.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save the receipt.")),
  });

  const share = useMutation({
    mutationFn: async ({ id, shared }: { id: string; shared: boolean }) => {
      const { error } = await supabase
        .from("expense_receipts")
        .update({ shared_with_client: shared, shared_at: shared ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, "Could not change sharing.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("expense_receipts")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Receipt removed.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove the receipt.")),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Private cost records for {clientName}. Nothing here is visible to the client unless you
          share it.
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {adding ? "Cancel" : "Add expense receipt"}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2"
        >
          <input required value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className={inputCls} />
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (USD)"
            className={inputCls}
          />
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputCls} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
          <button
            type="submit"
            disabled={add.isPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
          >
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save receipt
          </button>
        </form>
      )}

      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((receipt) => (
            <li
              key={receipt.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{receipt.vendor}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1",
                      receipt.shared_with_client
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : "bg-elevated text-muted-foreground ring-border",
                    )}
                  >
                    {receipt.shared_with_client ? "shared" : "private"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(receipt.amount_cents / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: receipt.currency || "USD",
                  })}{" "}
                  · {new Date(receipt.spent_on).toLocaleDateString()}
                  {receipt.note ? ` · ${receipt.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => share.mutate({ id: receipt.id, shared: !receipt.shared_with_client })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
                >
                  {receipt.shared_with_client ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> Stop sharing
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5" /> Share with client
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => confirm("Remove this receipt?") && remove.mutate(receipt.id)}
                  className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
                  aria-label="Remove receipt"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
