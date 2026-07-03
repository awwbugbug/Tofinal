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
  plannedDate: string | null;
  stackId: string;
  stackOrder: number;
  completedAt: string | null;
};

export type TaskStack = {
  id: string;
  sortOrder: number;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaskStackView = {
  stack: TaskStack;
  tasks: Task[];
  mainTask: Task;
  completedCount: number;
  totalCount: number;
  todayRelevantCount: number;
};

export type AppMode = "normal" | "pin";

export type TaskFilter = "today" | "all" | "important" | "pinned";
