"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  createTask,
  deleteTask,
  toggleTask,
  updateTask,
} from "@/actions/tasks";
import type { Task, TaskPriority } from "@/lib/types";

type Props = {
  roomId: string;
  roomCode: string;
  initialTasks: Task[];
};

const priorityDot: Record<TaskPriority, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-400",
  low: "bg-emerald-500",
};

export function TodoList({ roomId, roomCode, initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [optimisticTasks, setOptimistic] = useOptimistic(tasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sync(next: Task[]) {
    setTasks(next);
  }

  function onCreate(formData: FormData) {
    setError(null);
    const title = String(formData.get("title") || "").trim();
    const priority = String(formData.get("priority") || "medium") as TaskPriority;
    if (!title) return;

    const temp: Task = {
      id: `temp-${Date.now()}`,
      user_id: "",
      room_id: roomId,
      title,
      description: null,
      priority,
      completed: false,
      deadline: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    startTransition(async () => {
      setOptimistic([...tasks, temp]);
      formData.set("room_id", roomId);
      formData.set("room_code", roomCode);
      const result = await createTask(formData);
      if (result.error || !result.task) {
        setError(result.error || "Could not add task.");
        return;
      }
      sync([result.task, ...tasks]);
    });
  }

  function onToggle(task: Task) {
    startTransition(async () => {
      const next = tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              completed: !t.completed,
              completed_at: !t.completed ? new Date().toISOString() : null,
            }
          : t,
      );
      setOptimistic(next);
      sync(next);
      const result = await toggleTask(task.id, !task.completed, roomCode);
      if (result.error) setError(result.error);
    });
  }

  function onDelete(taskId: string) {
    startTransition(async () => {
      const next = tasks.filter((t) => t.id !== taskId);
      setOptimistic(next);
      sync(next);
      const result = await deleteTask(taskId, roomCode);
      if (result.error) setError(result.error);
    });
  }

  function onUpdate(formData: FormData) {
    startTransition(async () => {
      formData.set("room_code", roomCode);
      const result = await updateTask(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      const taskId = String(formData.get("task_id"));
      const title = String(formData.get("title"));
      const priority = String(formData.get("priority")) as TaskPriority;
      const next = tasks.map((t) =>
        t.id === taskId ? { ...t, title, priority } : t,
      );
      sync(next);
      setEditingId(null);
    });
  }

  return (
    <section className="room-panel p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        To-do list
      </h2>

      <form action={onCreate} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          name="title"
          placeholder="Add a task…"
          className="input flex-1"
          required
        />
        <select name="priority" defaultValue="medium" className="input sm:w-32">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" className="btn-secondary" disabled={pending}>
          Add
        </button>
      </form>

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      <ul className="mt-4 space-y-2">
        {optimisticTasks.map((task) => (
          <li
            key={task.id}
            className="flex items-start gap-3 rounded-xl bg-white/35 px-3 py-2.5"
          >
            <button
              type="button"
              aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
              onClick={() => onToggle(task)}
              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                task.completed
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--line)] bg-white"
              }`}
            >
              {task.completed ? "✓" : ""}
            </button>

            {editingId === task.id ? (
              <form action={onUpdate} className="flex flex-1 flex-col gap-2">
                <input type="hidden" name="task_id" value={task.id} />
                <input
                  name="title"
                  defaultValue={task.title}
                  className="input"
                  required
                />
                <div className="flex gap-2">
                  <select
                    name="priority"
                    defaultValue={task.priority}
                    className="input"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button type="submit" className="btn-secondary text-xs">
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)]"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${priorityDot[task.priority]}`}
                  />
                  <p
                    className={`truncate font-medium ${
                      task.completed
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--ink)]"
                    }`}
                  >
                    {task.title}
                  </p>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-[var(--muted)]">
                  <button type="button" onClick={() => setEditingId(task.id)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => onDelete(task.id)}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {optimisticTasks.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            No tasks yet. Add one to stay accountable.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
