"use client";

import * as React from "react";
import { Play, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { triggerRun } from "@/lib/actions/task-actions";

export function TaskRunButton({ taskId }: { taskId: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      onClick={() => start(() => triggerRun(taskId))}
      disabled={pending}
      variant="primary"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Play className="size-4" />
      )}
      Run now
    </Button>
  );
}
