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

export type AttachmentFileStorage = {
  pickImageFiles: () => Promise<string[]>;
  copyImageToAppData: (input: CopyImageInput) => Promise<CopiedAttachmentFile>;
  deleteAttachmentFile: (relativePath: string) => Promise<void>;
  resolvePreview: (relativePath: string, mimeType: string) => Promise<AttachmentPreview>;
};

export type AttachmentFileStorageRuntime = {
  pickImageFiles: () => Promise<string[]>;
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

export const tauriAttachmentFileStorage = createAttachmentFileStorage({
  pickImageFiles,
  stat: (path, options) => stat(path, options as Parameters<typeof stat>[1]),
  readFile: (path, options) => readFile(path, options as Parameters<typeof readFile>[1]),
  writeFile: (path, data, options) => writeFile(path, data, options as Parameters<typeof writeFile>[2]),
  mkdir: (path, options) => mkdir(path, options as Parameters<typeof mkdir>[1]),
  remove: (path, options) => remove(path, options as Parameters<typeof remove>[1]),
  exists: (path, options) => exists(path, options as Parameters<typeof exists>[1]),
  createObjectUrl: (data, mimeType) => URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType })),
});
