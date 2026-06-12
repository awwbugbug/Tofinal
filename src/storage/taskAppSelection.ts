import { open } from "@tauri-apps/plugin-dialog";

export type TaskAppSelection = {
  pickAppPath: () => Promise<string | null>;
};

export const tauriTaskAppSelection: TaskAppSelection = {
  async pickAppPath() {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Applications",
          extensions: ["exe", "lnk"],
        },
      ],
    });

    if (!selected || Array.isArray(selected)) {
      return null;
    }

    return selected;
  },
};
