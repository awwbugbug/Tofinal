export type TaskPriority = "normal" | "important" | "urgent";

export type Task = {
  id: string;
  title: string;
  note: string;
  completed: boolean;
  priority: TaskPriority;
  pinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AppMode = "normal" | "pin";

export type TaskFilter = "today" | "all" | "important" | "pinned";
