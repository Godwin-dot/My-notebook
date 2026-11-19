import type { Editor } from "@tiptap/core";

export type EditorBlockType = "task" | "checklist" | "callout" | "table" | "code";

export function insertEditorBlock(editor: Editor, type: EditorBlockType, taskText = ""): void {
  const movedOutsideTaskList = type !== "task" && moveSelectionOutsideTaskList(editor);

  if (type === "table") {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    return;
  }

  if (type === "callout") {
    if (movedOutsideTaskList) {
      editor.chain().focus().insertContent({
        type: "callout",
        attrs: { variant: "info" },
        content: [{ type: "paragraph" }],
      }).run();
    } else {
      editor.chain().focus().setCallout("info").run();
    }
    return;
  }

  if (type === "task") {
    editor.chain().focus().insertContent({
      type: "taskList",
      content: [{
        type: "taskItem",
        attrs: { checked: false },
        content: [{
          type: "paragraph",
          ...(taskText ? { content: [{ type: "text", text: taskText }] } : {}),
        }],
      }],
    }).run();
    return;
  }

  if (type === "checklist") {
    editor.chain().focus().insertContent([
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Checklist" }] },
      {
        type: "taskList",
        content: ["Étape 1", "Étape 2", "Étape 3"].map((text) => ({
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        })),
      },
    ]).run();
    return;
  }

  editor.chain().focus().insertContent({ type: "codeBlock" }).run();
}

function moveSelectionOutsideTaskList(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    if ($from.node(depth).type.name === "taskList") {
      editor.commands.setTextSelection($from.after(depth));
      return true;
    }
  }
  return false;
}
