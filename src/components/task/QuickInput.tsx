import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type QuickInputProps = {
  compact?: boolean;
  onAddTask: (title: string) => void;
};

export function QuickInput({ compact = false, onAddTask }: QuickInputProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onAddTask(trimmedTitle);
    setTitle("");
  };

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <Input
        aria-label="Add a task"
        className={compact ? "h-9 px-3 text-xs" : undefined}
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder="Add a task..."
        value={title}
      />
      <Button aria-label="Add task" size={compact ? "icon" : "default"} type="submit">
        <Plus className="h-4 w-4" />
        {!compact && <span>Add</span>}
      </Button>
    </form>
  );
}
