export type AttachmentKind = "image" | "screenshot";

export type TaskAttachment = {
  id: string;
  taskId: string;
  kind: AttachmentKind;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
};
