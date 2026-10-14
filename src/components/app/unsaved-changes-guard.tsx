import { useCallback } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function UnsavedChangesGuard({
  dirty,
  subject = "changes",
}: {
  dirty: boolean;
  subject?: string;
}) {
  const shouldBlockFn = useCallback(() => dirty, [dirty]);
  const blocker = useBlocker({
    shouldBlockFn,
    disabled: !dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });

  return (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving {subject}?</AlertDialogTitle>
          <AlertDialogDescription>
            Keep editing to save your latest work, or discard these changes and leave this page. A
            server draft only includes the last version marked saved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              blocker.proceed?.();
            }}
          >
            Discard and leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
