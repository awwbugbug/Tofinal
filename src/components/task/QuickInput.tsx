import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/useI18n";

type QuickInputProps = {
  compact?: boolean;
  onAddTask: (title: string) => void;
};

export function QuickInput({ compact = false, onAddTask }: QuickInputProps) {
  const { t } = useI18n();
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
        aria-label={t("task.addTask")}
        className={compact ? "h-9 px-3 text-xs" : undefined}
        data-quick-add-input={compact ? undefined : "true"}
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder={t("task.addPlaceholder")}
        value={title}
      />
      <Button aria-label={t("task.addTask")} size="icon" type="submit">
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}
