import { createTranslator } from "@/i18n/messages";
import { usePreferencesStore } from "@/stores/preferencesStore";

export const useI18n = () => {
  const language = usePreferencesStore((state) => state.language);

  return {
    language,
    t: createTranslator(language),
  };
};
