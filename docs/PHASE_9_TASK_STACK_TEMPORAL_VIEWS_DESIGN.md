# Phase 9A Task Stack + Temporal Views Design

> Status: design only. This document is not an implementation plan to execute immediately.
>
> Scope rule: Phase 9A does not change code, SQLite schema, UI, dependencies, Widget Mode, Edge Dock, AI, MCP, tray, or global shortcuts.

## 1. Current Problem Diagnosis

The current task model is usable for a local personal task list, but it is still a flat list with weak product semantics around time and execution.

Known problems:

1. `Today` and `All Tasks` are too similar. Both currently behave like list filters rather than distinct work modes.
2. `Today` is not truly connected to time, planning, or "what I will execute today".
3. `All Tasks` is not clearly positioned as a backlog or task library.
4. Tasks are flat capsules. They cannot represent a sequence of related work.
5. The desired interaction is stack-oriented: drag capsules to reorder, stack related capsules, and expand a stack.
6. Task detail editing and subtask relationships do not currently have a supporting data model.

The core design problem is that ToFinal needs two orthogonal improvements:

- Temporal views: make `Today` and `All Tasks` mean different things.
- Task stacks: represent ordered task sequences without introducing a complex project-management tree.

## 2. Product Redefinition

### Today

`Today` should become the execution view.

It answers: "What should I work on today?"

Recommended behavior:

- Show incomplete tasks where `plannedDate = today`.
- Show incomplete tasks where `dueDate <= today`, if `dueDate` is implemented.
- Optionally show `pinned` or `in-progress` tasks.
- New tasks created inside `Today` default to `plannedDate = today`.
- Completed tasks from today can be shown in a collapsible completed section at the bottom.
- Tasks without `plannedDate`, `dueDate`, or in-progress/pinned relevance should not appear in the main Today active list.

### All Tasks

`All Tasks` should become the management and backlog view.

It answers: "What tasks exist, and how do I organize them?"

Recommended behavior:

- Show all active incomplete tasks.
- Show backlog tasks where `plannedDate = null`.
- Show today tasks.
- Show future planned tasks.
- Optionally show completed tasks behind a toggle or completed section.
- New tasks created inside `All Tasks` default to `plannedDate = null`, unless the user explicitly schedules them.

### Required distinction

- `Today` is an execution view.
- `All Tasks` is a management/backlog view.
- They should no longer show identical content by default.

## 3. Temporal Task Fields

The task model needs explicit temporal fields. Existing `createdAt` is not enough.

### Field comparison

| Field | Meaning | Should drive Today? | Notes |
| --- | --- | --- | --- |
| `plannedDate` | The day the user intends to work on the task | Yes | Main field for Today |
| `dueDate` | Deadline | Optional yes | Useful for overdue work |
| `createdAt` | When the task was created | No | Creation date does not mean execution date |
| `completedAt` | When the task was completed | Yes, for completed section | Already present in the current type, but must be treated as temporal view data |

### Phase 9B MVP recommendation

Add at least:

- `plannedDate: string | null`
- keep/use `completedAt: string | null`

Optional:

- `dueDate: string | null`

Rules:

- `createdAt` must not be the primary basis for Today.
- `Today` should be based on `plannedDate`, `dueDate`, and `completedAt`.
- `All Tasks` must be able to show backlog tasks where `plannedDate = null`.

## 4. Task Stack / Sequence Stack Definition

A task stack is an ordered sequence of task capsules.

Product rules:

- A stack contains one or more tasks.
- The first task in a stack is the main task.
- Collapsed stack state shows only the main task.
- Expanded stack state shows all task capsules in order.
- Dragging one task onto another task can merge them into the same stack.
- Tasks inside a stack can be reordered.
- Stacks can be reordered globally.
- A task can be dragged out of a stack and become its own singleton stack.
- If a subtask is dragged to the first position, it becomes the visible main task.
- Only the current main task opens the full detail editor.
- Non-main tasks can still retain their own task data.
- If a non-main task is promoted to first position, its own detail data becomes available again.

Explicitly forbidden in the first stack version:

- Infinite nesting.
- Subtasks with their own subtasks.
- Cross-level trees.
- Gantt charts.
- Kanban.
- AI task decomposition.
- Complex dependency graphs.

The intent is sequence, not hierarchy.

## 5. Data Model Design

### Option A: Add `parent_id` / `parent_order` to `tasks`

Pros:

- Simple schema change.
- Easy to understand at first glance.

Cons:

- Main task changes are awkward.
- Global stack ordering is harder.
- Splitting a task out of a stack is harder.
- Reordering both globally and inside a parent group becomes fragile.
- It pushes stack behavior into the task table without representing stacks as first-class objects.

### Option B: Add `task_stacks` table and `stack_id` / `stack_order` to `tasks`

Recommended.

Pros:

- A stack becomes a first-class model.
- Global ordering belongs to `task_stacks.sort_order`.
- Internal ordering belongs to `tasks.stack_order`.
- Splitting, merging, collapsing, and promoting main task are clearer.
- Future UI can operate on stacks without guessing from parent fields.

Cons:

- Requires schema migration.
- Requires repository and store changes.
- Requires a careful existing-task migration.

### Recommended schema

`task_stacks`:

```sql
id TEXT PRIMARY KEY,
sort_order INTEGER NOT NULL,
collapsed INTEGER NOT NULL DEFAULT 1 CHECK (collapsed IN (0, 1)),
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
```

New `tasks` columns:

```sql
stack_id TEXT NOT NULL,
stack_order INTEGER NOT NULL,
planned_date TEXT NULL,
due_date TEXT NULL,
completed_at TEXT NULL
```

Rules:

- Existing tasks migrate into singleton stacks.
- Each singleton stack has one task with `stack_order = 0`.
- Global stack order is determined by `task_stacks.sort_order`.
- Main task is the task with the smallest `stack_order`.
- Existing `completed` remains the boolean status field.
- `completed_at` supports temporal views.
- Existing task fields must not be removed.
- The SQLite schema version should be decided during implementation based on the current schema version at that time.

## 6. Task Detail Editing Rules

Detail editing must respect stack position.

Rules:

- Clicking a collapsed stack opens the main task detail.
- In an expanded stack, clicking the first task opens the main task detail.
- Clicking a non-main task selects or highlights it, but does not open the full detail editor.
- Non-main tasks cannot edit `note`, `priority`, `tags`, attachments, screenshots, or app bindings from the full detail panel.
- Existing non-main task data is not deleted; it is only hidden from full detail editing while the task is not main.
- If a task is dragged to the first position, it becomes the main task and can open the full detail editor.
- Deleting a stack and deleting a task must have explicit data rules.

Deletion recommendation:

- Deleting a single task inside a stack removes only that task.
- If deleting the main task and other tasks remain, the next lowest `stack_order` task becomes the main task.
- If deleting the last task in a stack, delete the stack.
- Deleting an entire stack deletes all tasks in it, including their attachments/app bindings through existing cascade or cleanup rules.

## 7. Drag Interaction Design

### 7.1 Global reorder

Dragging a stack changes `task_stacks.sort_order`.

This is allowed in `All Tasks` first. `Today` reorder can be implemented later because temporal filters make ordering semantics more complicated.

### 7.2 Merge stack

Dragging a task capsule onto another task or stack can trigger stack merge.

Rules:

- Dragging a singleton task onto a target stack inserts it into the target stack.
- Dragging an expanded stack item onto a target stack moves that task only, not necessarily the whole source stack.
- Default insertion point is the end of the target stack unless the drop location indicates a specific position.
- After merge, normalize `stack_order` values to `0..n`.

### 7.3 Reorder inside stack

When a stack is expanded, tasks inside it can be reordered.

Rules:

- `tasks.stack_order` changes.
- The first item becomes the main visible task.
- Reorder should be persisted through the same save queue discipline used by existing SQLite task persistence.

### 7.4 Split out from stack

Dragging a task out of an expanded stack into a global list gap creates a new singleton stack.

Rules:

- Preserve task data.
- Create a new `task_stacks` row.
- Assign the moved task to the new stack with `stack_order = 0`.
- Insert the new stack at the drop position.
- Normalize both source stack orders and global stack orders.

### 7.5 Cross-view drag

Cross-view drag should not be part of the first version.

Reason:

- Dragging from `All Tasks` into `Today` implies setting `plannedDate = today`.
- Dragging from `Today` into `All Tasks` could imply clearing `plannedDate`, but that is semantically ambiguous.

Recommendation:

- Phase 9D should only support drag inside the current view.
- Scheduling should be done through explicit date controls in Phase 9B/9C.

## 8. Animation Design

Animation should clarify structure without feeling like a toy.

Recommended motion:

- Drag start: task capsule gets slight scale and shadow.
- Merge target: target stack gets subtle highlight.
- Merge success: moved task slides into stack.
- Expand stack: height, opacity, and translateY transition.
- Collapse stack: child tasks visually tuck under the main capsule.
- Reorder: use FLIP or transform-based animation.

Constraints:

- No exaggerated bounce.
- No large animation library by default.
- Prefer CSS transition and transform.
- If a DnD library is introduced, it must be justified separately.
- Respect reduced motion preferences.

## 9. Drag-and-Drop Technical Options

### Option A: Native Pointer Events

Pros:

- No dependency.
- Full control over interaction.
- Fits current dependency discipline.

Cons:

- Nested sortable behavior is hard.
- Collision detection must be custom.
- Accessibility work is manual.
- Drag overlay and auto-scroll require careful implementation.

Best use:

- Phase 9D first pass with simple global reorder.
- Only if stack interactions are kept intentionally limited.

### Option B: `dnd-kit`

Pros:

- Modern sortable primitives.
- Supports drag overlay and collision detection.
- Better suited for nested sortable interactions.
- Maintained and modular.
- Reasonable dependency cost compared with implementing all DnD primitives manually.

Cons:

- New dependency.
- Requires careful integration with existing capsules and scroll containers.
- Tests need adapter/mocking strategy.

Best use:

- If Phase 9D needs reorder, merge, split, and nested sortable in one coherent implementation.

### Option C: `react-beautiful-dnd` or similar older libraries

Pros:

- Familiar interaction model.

Cons:

- Maintenance status is poor for the original package.
- Less suitable for modern React and nested custom capsules.
- Higher risk for long-term maintenance.

Recommendation:

- If no new dependency is allowed, use native Pointer Events in phases.
- If one DnD dependency is acceptable, prefer `dnd-kit`.
- Do not use unmaintained or heavy DnD libraries.

## 10. Today / All Tasks Relationship With Stacks

### Today

Today shows stacks that match Today conditions.

Recommended rule:

- If any task inside a stack matches Today conditions, show the whole stack.
- Mark which child tasks are Today-relevant.
- If the stack is collapsed, the main task remains the visible anchor, with a Today count or marker.

Reason:

- Showing only matching children would break stack context.
- Showing the whole stack preserves the sequence.

### All Tasks

All Tasks shows all active stacks.

Recommended rule:

- Show active stacks by global `sort_order`.
- Completed stacks can be hidden behind a completed section or toggle.
- Backlog stacks where every task has `plannedDate = null` remain visible in All Tasks.

### Completed behavior

Recommended first-version rules:

- Do not automatically reorder the main task when the main task is completed.
- The user changes the main task by dragging another task to first position.
- A completed main task can still be displayed as completed while the stack remains active.
- If every task in a stack is completed, hide it from the Today active section and show it in a completed section.

## 11. Minimal UI Boundary

Phase 9 stack UI should be conservative.

Recommended UI:

- TaskList displays stack capsules.
- Collapsed state: show main task, child count, and completion progress.
- Expanded state: show a larger capsule/container with ordered child capsules.
- Expanded stack must visually sit above surrounding list items so shadows and drag affordances are not clipped.
- Child task capsules are lighter than the main task capsule.
- Main task capsule is emphasized but not visually heavy.
- Clicking stack header expands/collapses.
- Clicking main task opens detail.
- Clicking child task does not open full detail editing.
- Drag handle is optional.
- Narrow widths must not clip controls or capsule effects.
- Desktop Pin Mode should not support full stack editing in the first version; it can show only main task and count.

## 12. Error Handling

Phase 9 implementation must handle:

- Migration failure.
- Missing `stack_id`.
- Duplicate `stack_order`.
- Duplicate `sort_order`.
- Drag cancel.
- Drop into invalid area.
- Merge save failure.
- Reorder save failure.
- Split save failure.
- Promoted main task detail refresh error.
- Today / All filter exceptions.
- `completedAt` write failure.
- SQLite save queue conflicts.

Recommended recovery rules:

- Keep the in-memory UI unchanged until a stack mutation is confirmed or maintain a rollback snapshot for optimistic updates.
- If save fails, surface a diagnostic error and keep the user from believing the change persisted.
- Normalize ordering after every successful stack mutation.
- Repository should expose stack-level transactions, not a sequence of independent writes from UI components.

## 13. Test Plan

Minimum test coverage:

- Migration existing tasks to singleton stacks.
- `task_stacks` rows are created correctly.
- Main task is the task with the smallest `stack_order`.
- Global stack order is stable.
- Internal stack order is stable.
- Merge task into stack.
- Reorder inside stack.
- Drag first task changes main display.
- Split task out of stack.
- Non-main task cannot open detail editor.
- Promoted task can open detail editor.
- `plannedDate = today` appears in Today.
- `plannedDate = null` appears in All Tasks but not Today.
- `completedAt` is set on completion.
- Today completed section.
- All Tasks shows backlog.
- Image attachments regression.
- Screenshot editor regression.
- App binding regression.
- Preferences regression.
- Desktop Pin Mode regression.
- Widget Mode only if a future branch reintroduces it; current stable implementation should not depend on Widget Mode.

## 14. Phase 9B / 9C / 9D Split

### Phase 9B: Temporal task fields and view semantics

Scope:

- Add temporal fields.
- Redefine Today and All Tasks behavior.
- Add `plannedDate`.
- Ensure `completedAt` is consistently written.
- Do not implement drag stacks.

Reason:

- Today / All must form a clear product loop before stack complexity is added.

### Phase 9C: Stack data model and stack rendering

Scope:

- Add `task_stacks` schema.
- Migrate existing tasks to singleton stacks.
- Render stacks.
- Expand/collapse stacks.
- Enforce main-task detail editing rule.
- Do not implement complex drag behavior yet.

Reason:

- Stabilize the stack model before adding drag interactions.

### Phase 9D: Drag reorder, merge, split, and animations

Scope:

- Global stack reorder.
- Internal stack reorder.
- Merge task into stack.
- Split task out of stack.
- Main task follows first stack item.
- Add drag animations.
- Ensure save stability.

Reason:

- Drag and DnD are the highest-risk part and should come after model stability.

## 15. Acceptance Criteria

### Phase 9B acceptance

- Today and All Tasks show visibly different content.
- Today shows today-planned, overdue, or active execution tasks.
- All Tasks shows all active/backlog tasks.
- New tasks in different views receive different `plannedDate` defaults.
- `completedAt` is written correctly.
- Existing tasks migrate safely.
- Existing attachments, screenshots, app bindings, preferences, and Desktop Pin behavior still pass regression tests.

### Phase 9C acceptance

- Every task belongs to a stack.
- Singleton stacks work normally.
- Stack expand/collapse works.
- First task is displayed as the main task.
- Non-main tasks cannot open full detail editing.
- Promoted first task can open full detail editing.
- Existing task detail editing still works for main tasks.
- Existing attachments, screenshots, app bindings, preferences, and Desktop Pin behavior remain intact.

### Phase 9D acceptance

- Global stack reorder persists.
- Internal stack reorder persists.
- Merge works.
- Split out works.
- Main task changes when first item changes.
- Drag animations are clear and restrained.
- Save behavior remains stable after restart.
- Invalid drops do not corrupt data.

## 16. Future Enhancements

Potential future features, explicitly outside Phase 9:

- Multi-level nesting.
- Dependency graph.
- Automatic scheduling.
- AI task decomposition.
- MCP operations on stacks.
- Calendar integration.
- Reminders.
- Edge Dock stack summary.
- Widget Mode stack interaction.
- Global shortcut stack capture.
- Advanced completed-task analytics.

## 17. Recommended Next Step

The next implementation phase should be Phase 9B, not stack drag.

Recommended order:

1. Add `plannedDate` and strengthen `completedAt`.
2. Redefine Today / All Tasks with tests.
3. Validate existing task workflows.
4. Only then introduce stack schema.

This keeps the execution loop useful before adding structural complexity.
