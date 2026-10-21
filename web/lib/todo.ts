// Things students need to do or remember after class, picked up from what the teacher says.
export const TODO_KINDS = ["exam", "homework", "bring", "deadline", "other"] as const;
export type TodoKind = (typeof TODO_KINDS)[number];
export type Todo = { id: string; kind: TodoKind; text: string; due?: string };
