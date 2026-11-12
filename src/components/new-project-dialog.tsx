"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import NewProjectForm from "./new-project-form";

export default function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const pending = useRef(false);

  function beginSubmission() {
    if (pending.current) return false;
    pending.current = true;
    return true;
  }

  function endSubmission() {
    pending.current = false;
  }

  function preventPendingDismissal(event: Event) {
    if (pending.current) event.preventDefault();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!pending.current) setOpen(next);
    }}>
      <Dialog.Trigger className="wb-btn">New Hubnot project</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65" />
        <Dialog.Content
          className="wb-panel fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-xl sm:p-6"
          onEscapeKeyDown={preventPendingDismissal}
          onPointerDownOutside={preventPendingDismissal}
        >
          <Dialog.Title className="text-lg font-semibold">New Hubnot project</Dialog.Title>
          <Dialog.Description className="wb-muted mt-1 mb-4 text-sm">
            Create a Git repository with Hubnot governance and a founding signed issue.
          </Dialog.Description>
          <NewProjectForm beginSubmission={beginSubmission} endSubmission={endSubmission} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
