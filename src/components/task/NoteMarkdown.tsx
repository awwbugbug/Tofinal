import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";

type NoteMarkdownProps = {
  text: string;
  className?: string;
};

export function NoteMarkdown({ className, text }: NoteMarkdownProps) {
  return <div className={cn("note-markdown", className)}>{renderMarkdown(text)}</div>;
}
