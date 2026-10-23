import { archiveCompletedContract } from "@/lib/signwell-archive.server";
import { sendSignedContractCopyEmail } from "@/lib/document-completion-email.server";
import { getSignwellDocument } from "@/lib/signwell.server";
import {
  isCompletedSignwellStatus,
  nextSignwellContractStatus,
  signwellTransitionSources,
} from "@/lib/signwell-webhook";

const MAX_JOB_ATTEMPTS = 8;

type CompletionJob = {
  contract_id: string;
  provider_document_id: string;
  attempts: number;
  locked_at: string;
  archive_completed_at: string | null;
  email_completed_at: string | null;
};

const safeCompletedAt = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return new Date().toISOString();
};

const retryDelayMs = (attempt: number) =>
  Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1));

/**
 * Recover lifecycle changes missed while the webhook was disabled. Each run
 * checks the least-recently-polled active documents against SignWell's API.
 */
export async function reconcileSignwellContractStatuses(limit = 3) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const boundedLimit = Math.max(1, Math.min(limit, 10));
  const contractsResult = await supabaseAdmin
    .from("client_contracts")
    .select(
      "id,workspace_id,status,sent_at,signed_at,published_at,provider_document_id,provider_status_checked_at",
    )
    .eq("provider", "signwell")
    .in("status", ["draft", "sent", "viewed"])
    .not("provider_document_id", "is", null)
    .order("provider_status_checked_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(boundedLimit);
  if (contractsResult.error?.code === "PGRST204") {
    return { available: false, checked: 0, updated: 0, failed: 0 };
  }
  if (contractsResult.error) throw contractsResult.error;

  const outcomes = await Promise.all(
    (contractsResult.data ?? []).map(async (contract) => {
      const checkedAt = new Date().toISOString();
      try {
        const documentId = contract.provider_document_id;
        if (!documentId) throw new Error("provider_document_missing");
        const providerDocument = await getSignwellDocument(documentId, { timeoutMs: 4_000 });
        if (providerDocument.id !== documentId) throw new Error("provider_document_mismatch");
        if (
          providerDocument.metadata &&
          (providerDocument.metadata.contract_id !== contract.id ||
            providerDocument.metadata.workspace_id !== contract.workspace_id)
        ) {
          throw new Error("provider_metadata_mismatch");
        }

        const nextStatus = nextSignwellContractStatus(
          contract.status,
          String(providerDocument.status ?? ""),
        );
        if (!nextStatus || nextStatus === contract.status) {
          const checked = await supabaseAdmin
            .from("client_contracts")
            .update({ provider_status_checked_at: checkedAt })
            .eq("id", contract.id)
            .eq("provider", "signwell")
            .eq("provider_document_id", documentId);
          if (checked.error) throw checked.error;
          return "checked" as const;
        }

        const occurredAt = safeCompletedAt(
          nextStatus === "signed" ? providerDocument.completed_at : null,
          providerDocument.updated_at,
        );
        const patch = {
          status: nextStatus,
          provider_status_checked_at: checkedAt,
          ...(nextStatus !== "draft" && !contract.sent_at ? { sent_at: occurredAt } : {}),
          ...(nextStatus !== "draft" && !contract.published_at ? { published_at: occurredAt } : {}),
          ...(nextStatus === "signed" && !contract.signed_at ? { signed_at: occurredAt } : {}),
        };
        const updated = await supabaseAdmin
          .from("client_contracts")
          .update(patch)
          .eq("id", contract.id)
          .eq("provider", "signwell")
          .eq("provider_document_id", documentId)
          .in("status", signwellTransitionSources(nextStatus))
          .select("id");
        if (updated.error) throw updated.error;
        return updated.data?.length ? ("updated" as const) : ("checked" as const);
      } catch (error) {
        const marked = await supabaseAdmin
          .from("client_contracts")
          .update({ provider_status_checked_at: checkedAt })
          .eq("id", contract.id)
          .eq("provider", "signwell")
          .eq("provider_document_id", contract.provider_document_id);
        console.error("[signwell reconciliation] status check failed", {
          contractId: contract.id,
          code: marked.error?.code ?? null,
          reason: error instanceof Error ? error.message : "status_check_failed",
        });
        return "failed" as const;
      }
    }),
  );

  return {
    available: true,
    checked: outcomes.length,
    updated: outcomes.filter((outcome) => outcome === "updated").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}

/** Drain a leased batch. Webhook latency never depends on this work. */
export async function processSignwellCompletionJobs(limit = 1) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const boundedLimit = Math.max(1, Math.min(limit, 10));
  const claimed = await supabaseAdmin.rpc("claim_signwell_completion_jobs", {
    _limit: boundedLimit,
  });
  if (claimed.error?.code === "PGRST202") {
    return {
      available: false,
      claimed: 0,
      completed: 0,
      failed: 0,
      dead: 0,
      deadOutstanding: 0,
    };
  }
  if (claimed.error) throw claimed.error;

  const jobs = (claimed.data ?? []) as unknown as CompletionJob[];
  let completed = 0;
  let failed = 0;
  let dead = 0;

  for (const job of jobs) {
    try {
      const contractResult = await supabaseAdmin
        .from("client_contracts")
        .select(
          "id,workspace_id,title,description,signer_email,contract_data,source_template_version,provider,provider_document_id,status,signed_at,updated_at",
        )
        .eq("id", job.contract_id)
        .maybeSingle();
      if (contractResult.error) throw contractResult.error;
      const contract = contractResult.data;
      if (
        !contract ||
        contract.provider !== "signwell" ||
        contract.provider_document_id !== job.provider_document_id ||
        contract.status !== "signed"
      ) {
        throw new Error("contract_not_ready_for_completion");
      }

      const providerDocument = await getSignwellDocument(job.provider_document_id, {
        timeoutMs: 5_000,
      });
      if (
        providerDocument.id !== job.provider_document_id ||
        !isCompletedSignwellStatus(String(providerDocument.status ?? ""))
      ) {
        throw new Error("provider_document_not_completed");
      }
      if (
        providerDocument.metadata &&
        (providerDocument.metadata.contract_id !== contract.id ||
          providerDocument.metadata.workspace_id !== contract.workspace_id)
      ) {
        throw new Error("provider_metadata_mismatch");
      }

      let archiveCompletedAt = job.archive_completed_at;
      if (!archiveCompletedAt) {
        const completedAt = safeCompletedAt(
          providerDocument.completed_at,
          providerDocument.updated_at,
          contract.signed_at,
        );
        const archive = await archiveCompletedContract({
          contractId: contract.id,
          workspaceId: contract.workspace_id,
          providerDocumentId: job.provider_document_id,
          completedAt,
          templateVersion: contract.source_template_version,
          contractData: contract.contract_data,
          renderedText: contract.description,
          auditEvidence: {
            source: "signwell_api",
            provider: "signwell",
            retrieved_at: new Date().toISOString(),
            document_id: providerDocument.id,
            status: providerDocument.status ?? null,
            completed_at: providerDocument.completed_at ?? null,
            recipients: (providerDocument.recipients ?? []).map((recipient) => ({
              id: recipient.id,
              status: recipient.status ?? null,
              completed_at: recipient.completed_at ?? null,
            })),
          },
        });
        if (!archive.archived && archive.reason !== "already_archived") {
          throw new Error(archive.reason);
        }
        archiveCompletedAt = new Date().toISOString();
      }

      let emailCompletedAt = job.email_completed_at;
      if (!emailCompletedAt) {
        const delivery = await sendSignedContractCopyEmail(
          contract.workspace_id,
          { contractTitle: contract.title },
          [
            contract.signer_email,
            ...(providerDocument.recipients ?? []).map((recipient) => recipient.email),
          ],
          `${contract.id}/${job.provider_document_id}`,
        );
        if (delivery.attempted === 0 || delivery.failed || delivery.skipped) {
          throw new Error("completion_email_failed");
        }
        emailCompletedAt = new Date().toISOString();
      }

      const finished = await supabaseAdmin
        .from("signwell_completion_jobs")
        .update({
          state: "complete",
          archive_completed_at: archiveCompletedAt,
          email_completed_at: emailCompletedAt,
          locked_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("contract_id", job.contract_id)
        .eq("state", "processing")
        .eq("locked_at", job.locked_at)
        .select("contract_id");
      if (finished.error) throw finished.error;
      if (finished.data?.length) completed += 1;
    } catch (error) {
      const isDead = job.attempts >= MAX_JOB_ATTEMPTS;
      const message = (error instanceof Error ? error.message : "completion_job_failed").slice(
        0,
        300,
      );
      const released = await supabaseAdmin
        .from("signwell_completion_jobs")
        .update({
          state: isDead ? "dead" : "pending",
          next_attempt_at: new Date(Date.now() + retryDelayMs(job.attempts)).toISOString(),
          locked_at: null,
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("contract_id", job.contract_id)
        .eq("state", "processing")
        .eq("locked_at", job.locked_at);
      if (released.error) {
        console.error("[signwell completion] failed to release job", {
          contractId: job.contract_id,
          code: released.error.code,
        });
      }
      console.error("[signwell completion] job failed", {
        contractId: job.contract_id,
        attempt: job.attempts,
        dead: isDead,
        reason: message,
      });
      if (isDead) dead += 1;
      else failed += 1;
    }
  }

  const deadResult = await supabaseAdmin
    .from("signwell_completion_jobs")
    .select("contract_id", { count: "exact", head: true })
    .eq("state", "dead");
  if (deadResult.error) {
    console.error("[signwell completion] failed to count dead jobs", deadResult.error.code);
  }

  return {
    available: true,
    claimed: jobs.length,
    completed,
    failed,
    dead,
    deadOutstanding: deadResult.count ?? 0,
  };
}
