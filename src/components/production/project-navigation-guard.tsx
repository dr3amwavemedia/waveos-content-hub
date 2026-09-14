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

export function ProjectNavigationGuard({
  dirty,
  subject = "project notes",
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
            Your latest changes have not been saved. Keep editing to save them, or discard them and
            leave this page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Resolve the pending navigation without also running the close/reset handler.
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
