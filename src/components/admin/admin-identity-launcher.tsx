import { UserCog } from "lucide-react";
import { useState } from "react";

import { AdminIdentityManager } from "@/components/admin/admin-identity-manager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AdminIdentityLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-2 shadow-sm">
        <UserCog className="h-4 w-4" /> Staff tools
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Admin staff tools</DialogTitle>
          </DialogHeader>
          <AdminIdentityManager />
        </DialogContent>
      </Dialog>
    </>
  );
}
