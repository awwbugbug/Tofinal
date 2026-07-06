import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BaseDirectory,
  exists,
  mkdir,
  readFile,
  remove,
  stat,
  writeFile,
} from "@tauri-apps/plugin-fs";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_EXTENSIONS = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

type SupportedImageExtension = keyof typeof IMAGE_EXTENSIONS;

type FileStat = {
  isFile: boolean;
  size: number;
};

export type CopiedAttachmentFile = {
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

export type AttachmentPreview = {
  url: string | null;
  missing: boolean;
};

export type CopyImageInput = {
  taskId: string;
  attachmentId: string;
  sourcePath: string;
};

export type WriteScreenshotInput = {
  taskId: string;
  attachmentId: string;
  originalName: string;
  pngBytes: Uint8Array;
  width: number | null;
  height: number | null;
};

export type DroppedImageFile = {
  fileName: string;
  bytes: Uint8Array;
};

export type ImportDroppedImageInput = {
  taskId: string;
  attachmentId: string;
  sourcePath: string;
};

export type WritePastedImageInput = {
  taskId: string;
  attachmentId: string;
  originalName: string;
  bytes: Uint8Array;
  mimeType: string;
};

export type AttachmentFileStorage = {
  pickImageFiles: () => Promise<string[]>;
  copyImageToAppData: (input: CopyImageInput) => Promise<CopiedAttachmentFile>;
  importDroppedImageToAppData: (input: ImportDroppedImageInput) => Promise<CopiedAttachmentFile>;
  writePastedImageToAppData: (input: WritePastedImageInput) => Promise<CopiedAttachmentFile>;
  writeScreenshotToAppData: (input: WriteScreenshotInput) => Promise<CopiedAttachmentFile>;
  deleteAttachmentFile: (relativePath: string) => Promise<void>;
  resolvePreview: (relativePath: string, mimeType: string) => Promise<AttachmentPreview>;
  createPreviewUrl: (data: Uint8Array, mimeType: string) => string;
  revokePreviewUrl: (url: string) => void;
};

export type AttachmentFileStorageRuntime = {
  pickImageFiles: () => Promise<string[]>;
  readDroppedImage: (path: string) => Promise<DroppedImageFile>;
  stat: (path: string, options?: unknown) => Promise<FileStat>;
  readFile: (path: string, options?: unknown) => Promise<Uint8Array>;
  writeFile: (path: string, data: Uint8Array, options?: unknown) => Promise<void>;
  mkdir: (path: string, options?: unknown) => Promise<void>;
  remove: (path: string, options?: unknown) => Promise<void>;
  exists: (path: string, options?: unknown) => Promise<boolean>;
  createObjectUrl: (data: Uint8Array, mimeType: string) => string;
};

const appDataOptions = { baseDir: BaseDirectory.AppData };

const basename = (path: string) => {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
};

const extensionFromName = (name: string) => {
  const segments = name.split(".");
  const extension = segments[segments.length - 1]?.toLowerCase();
  if (!extension || !(extension in IMAGE_EXTENSIONS)) {
    return null;
  }

  return extension as SupportedImageExtension;
};

const sanitizePathSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

const attachmentDirectory = (taskId: string) => `attachments/images/${sanitizePathSegment(taskId)}`;

const normalizeStoredExtension = (extension: SupportedImageExtension) => (extension === "jpeg" ? "jpg" : extension);

const validateSourceImage = (sourcePath: string, fileStat: FileStat) => {
  if (!fileStat.isFile) {
    throw new Error("Selected image file is unavailable.");
  }

  if (fileStat.size > MAX_IMAGE_BYTES) {
    throw new Error("Selected image is larger than 10 MB.");
  }

  const originalName = basename(sourcePath);
  const extension = extensionFromName(originalName);
  if (!extension) {
    throw new Error("Unsupported image type. Use PNG, JPG, JPEG, or WebP.");
  }

  return {
    originalName,
    extension,
    mimeType: IMAGE_EXTENSIONS[extension],
  };
};

export const createAttachmentFileStorage = (
  runtime: AttachmentFileStorageRuntime,
): AttachmentFileStorage => ({
  pickImageFiles: runtime.pickImageFiles,
  async copyImageToAppData({ attachmentId, sourcePath, taskId }) {
    let fileStat: FileStat;
    try {
      fileStat = await runtime.stat(sourcePath);
    } catch {
      throw new Error("Selected image file is unavailable.");
    }

    const source = validateSourceImage(sourcePath, fileStat);
    const storedExtension = normalizeStoredExtension(source.extension);
    const storedName = `${sanitizePathSegment(attachmentId)}.${storedExtension}`;
    const directory = attachmentDirectory(taskId);
    const relativePath = `${directory}/${storedName}`;

    const data = await runtime.readFile(sourcePath);
    await runtime.mkdir(directory, { ...appDataOptions, recursive: true });
    await runtime.writeFile(relativePath, data, appDataOptions);

    return {
      originalName: source.originalName,
      storedName,
      relativePath,
      mimeType: source.mimeType,
      sizeBytes: fileStat.size,
      width: null,
      height: null,
    };
  },
  async importDroppedImageToAppData({ attachmentId, sourcePath, taskId }) {
    // The dropped path lives outside the fs plugin scope; the narrow Rust
    // command validates extension and size and returns the file bytes.
    const dropped = await runtime.readDroppedImage(sourcePath);
    if (dropped.bytes.byteLength === 0) {
      throw new Error("Dropped image file is empty.");
    }
    if (dropped.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Dropped image is larger than 10 MB.");
    }

    const extension = extensionFromName(dropped.fileName);
    if (!extension) {
      throw new Error("Unsupported image type. Use PNG, JPG, JPEG, or WebP.");
    }

    const storedExtension = normalizeStoredExtension(extension);
    const storedName = `${sanitizePathSegment(attachmentId)}.${storedExtension}`;
    const directory = attachmentDirectory(taskId);
    const relativePath = `${directory}/${storedName}`;

    await runtime.mkdir(directory, { ...appDataOptions, recursive: true });
    await runtime.writeFile(relativePath, dropped.bytes, appDataOptions);

    return {
      originalName: dropped.fileName,
      storedName,
      relativePath,
      mimeType: IMAGE_EXTENSIONS[extension],
      sizeBytes: dropped.bytes.byteLength,
      width: null,
      height: null,
    };
  },
  async writePastedImageToAppData({ attachmentId, bytes, mimeType, originalName, taskId }) {
    if (bytes.byteLength === 0) {
      throw new Error("Pasted image is empty.");
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Pasted image is larger than 10 MB.");
    }

    const extensionEntry = Object.entries(IMAGE_EXTENSIONS).find(([, mime]) => mime === mimeType);
    if (!extensionEntry) {
      throw new Error("Unsupported image type. Use PNG, JPG, JPEG, or WebP.");
    }

    const storedExtension = normalizeStoredExtension(extensionEntry[0] as SupportedImageExtension);
    const storedName = `${sanitizePathSegment(attachmentId)}.${storedExtension}`;
    const directory = attachmentDirectory(taskId);
    const relativePath = `${directory}/${storedName}`;

    await runtime.mkdir(directory, { ...appDataOptions, recursive: true });
    await runtime.writeFile(relativePath, bytes, appDataOptions);

    return {
      originalName,
      storedName,
      relativePath,
      mimeType,
      sizeBytes: bytes.byteLength,
      width: null,
      height: null,
    };
  },
  async writeScreenshotToAppData({ attachmentId, height, originalName, pngBytes, taskId, width }) {
    if (pngBytes.byteLength === 0) {
      throw new Error("Screenshot capture returned an empty PNG.");
    }

    const storedName = `${sanitizePathSegment(attachmentId)}.png`;
    const directory = attachmentDirectory(taskId);
    const relativePath = `${directory}/${storedName}`;

    await runtime.mkdir(directory, { ...appDataOptions, recursive: true });
    await runtime.writeFile(relativePath, pngBytes, appDataOptions);

    return {
      originalName,
      storedName,
      relativePath,
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
      width,
      height,
    };
  },
  async deleteAttachmentFile(relativePath) {
    if (await runtime.exists(relativePath, appDataOptions)) {
      await runtime.remove(relativePath, appDataOptions);
    }
  },
  async resolvePreview(relativePath, mimeType) {
    if (!(await runtime.exists(relativePath, appDataOptions))) {
      return { missing: true, url: null };
    }

    const data = await runtime.readFile(relativePath, appDataOptions);
    return {
      missing: false,
      url: runtime.createObjectUrl(data, mimeType),
    };
  },
  createPreviewUrl(data, mimeType) {
    return runtime.createObjectUrl(data, mimeType);
  },
  revokePreviewUrl(url) {
    URL.revokeObjectURL(url);
  },
});

const pickImageFiles = async () => {
  const selected = await open({
    multiple: true,
    filters: [
      {
        name: "Images",
        extensions: Object.keys(IMAGE_EXTENSIONS),
      },
    ],
  });

  if (!selected) {
    return [];
  }

  return Array.isArray(selected) ? selected : [selected];
};

const readDroppedImage = async (path: string): Promise<DroppedImageFile> => {
  const result = await invoke<{ fileName: string; bytes: number[] }>("read_dropped_image", { path });
  return {
    fileName: result.fileName,
    bytes: result.bytes instanceof Uint8Array ? result.bytes : Uint8Array.from(result.bytes),
  };
};

export const tauriAttachmentFileStorage = createAttachmentFileStorage({
  pickImageFiles,
  readDroppedImage,
  stat: (path, options) => stat(path, options as Parameters<typeof stat>[1]),
  readFile: (path, options) => readFile(path, options as Parameters<typeof readFile>[1]),
  writeFile: (path, data, options) => writeFile(path, data, options as Parameters<typeof writeFile>[2]),
  mkdir: (path, options) => mkdir(path, options as Parameters<typeof mkdir>[1]),
  remove: (path, options) => remove(path, options as Parameters<typeof remove>[1]),
  exists: (path, options) => exists(path, options as Parameters<typeof exists>[1]),
  createObjectUrl: (data, mimeType) => URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType })),
});
