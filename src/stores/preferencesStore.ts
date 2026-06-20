import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type ThemePreference = "light" | "dark" | "system";
export type LanguagePreference = "zh-CN" | "en-US";
export type GlassLevelPreference = "subtle" | "standard" | "strong";
export type ResolvedTheme = "light" | "dark";

type PreferencesState = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  language: LanguagePreference;
  completionCelebrationsEnabled: boolean;
  softGlassLevel: GlassLevelPreference;
  highlightGlassLevel: GlassLevelPreference;
  initialized: boolean;
};

type PreferencesActions = {
  loadPreferences: () => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setCompletionCelebrationsEnabled: (enabled: boolean) => void;
  setSoftGlassLevel: (level: GlassLevelPreference) => void;
  setHighlightGlassLevel: (level: GlassLevelPreference) => void;
  resetPreferences: () => void;
};

export type PreferencesStore = PreferencesState & PreferencesActions;

export const PREFERENCES_STORAGE_KEY = "tofinal.preferences.v1";

const DEFAULT_THEME: ThemePreference = "system";
const DEFAULT_LANGUAGE: LanguagePreference = "zh-CN";
const DEFAULT_COMPLETION_CELEBRATIONS_ENABLED = true;
const DEFAULT_GLASS_LEVEL: GlassLevelPreference = "standard";

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

const isLanguagePreference = (value: unknown): value is LanguagePreference =>
  value === "zh-CN" || value === "en-US";

const isGlassLevelPreference = (value: unknown): value is GlassLevelPreference =>
  value === "subtle" || value === "standard" || value === "strong";

const initialState = (): PreferencesState => ({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  language: DEFAULT_LANGUAGE,
  completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
  softGlassLevel: DEFAULT_GLASS_LEVEL,
  highlightGlassLevel: DEFAULT_GLASS_LEVEL,
  initialized: false,
});

const getStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const defaultPersistedPreferences = (): Pick<
  PreferencesState,
  "theme" | "language" | "completionCelebrationsEnabled" | "softGlassLevel" | "highlightGlassLevel"
> => ({
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
  softGlassLevel: DEFAULT_GLASS_LEVEL,
  highlightGlassLevel: DEFAULT_GLASS_LEVEL,
});

const readPersistedPreferences = (): Pick<
  PreferencesState,
  "theme" | "language" | "completionCelebrationsEnabled" | "softGlassLevel" | "highlightGlassLevel"
> => {
  try {
    const raw = getStorage()?.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return defaultPersistedPreferences();
    }

    const parsed = JSON.parse(raw) as {
      version?: number;
      theme?: unknown;
      language?: unknown;
      completionCelebrationsEnabled?: unknown;
      softGlassLevel?: unknown;
      highlightGlassLevel?: unknown;
    };
    if (!isThemePreference(parsed.theme) || !isLanguagePreference(parsed.language)) {
      return defaultPersistedPreferences();
    }

    if (parsed.version === 1) {
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
        softGlassLevel: DEFAULT_GLASS_LEVEL,
        highlightGlassLevel: DEFAULT_GLASS_LEVEL,
      };
    }

    if (parsed.version === 2 && typeof parsed.completionCelebrationsEnabled === "boolean") {
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: parsed.completionCelebrationsEnabled,
        softGlassLevel: DEFAULT_GLASS_LEVEL,
        highlightGlassLevel: DEFAULT_GLASS_LEVEL,
      };
    }

    if (
      parsed.version === 3 &&
      typeof parsed.completionCelebrationsEnabled === "boolean" &&
      isGlassLevelPreference(parsed.softGlassLevel) &&
      isGlassLevelPreference(parsed.highlightGlassLevel)
    ) {
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: parsed.completionCelebrationsEnabled,
        softGlassLevel: parsed.softGlassLevel,
        highlightGlassLevel: parsed.highlightGlassLevel,
      };
    }

    return defaultPersistedPreferences();
  } catch {
    return defaultPersistedPreferences();
  }
};

const persistPreferences = (
  theme: ThemePreference,
  language: LanguagePreference,
  completionCelebrationsEnabled: boolean,
  softGlassLevel: GlassLevelPreference,
  highlightGlassLevel: GlassLevelPreference,
) => {
  try {
    getStorage()?.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        theme,
        language,
        completionCelebrationsEnabled,
        softGlassLevel,
        highlightGlassLevel,
      }),
    );
  } catch {
    // Preferences are best-effort UI state; failed writes must not block the app.
  }
};

const getSystemPrefersDark = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
};

const resolveTheme = (theme: ThemePreference): ResolvedTheme => {
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  return getSystemPrefersDark() ? "dark" : "light";
};

const applyTheme = (resolvedTheme: ResolvedTheme) => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolvedTheme;
  }
};

const applyGlassLevels = (softGlassLevel: GlassLevelPreference, highlightGlassLevel: GlassLevelPreference) => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.softGlass = softGlassLevel;
    document.documentElement.dataset.highlightGlass = highlightGlassLevel;
  }
};

const createPreferencesStoreState: StateCreator<PreferencesStore> = (set, get) => {
  let unsubscribeSystemTheme: (() => void) | null = null;

  const stopSystemThemeListener = () => {
    unsubscribeSystemTheme?.();
    unsubscribeSystemTheme = null;
  };

  const startSystemThemeListener = () => {
    stopSystemThemeListener();

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    try {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (event: MediaQueryListEvent | { matches: boolean }) => {
        if (get().theme !== "system") {
          return;
        }

        const resolvedTheme = event.matches ? "dark" : "light";
        set({ resolvedTheme });
        applyTheme(resolvedTheme);
      };

      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handleChange);
        unsubscribeSystemTheme = () => query.removeEventListener("change", handleChange);
        return;
      }

      if (typeof query.addListener === "function") {
        query.addListener(handleChange);
        unsubscribeSystemTheme = () => query.removeListener(handleChange);
      }
    } catch {
      stopSystemThemeListener();
    }
  };

  const commitPreferences = (
    theme: ThemePreference,
    language: LanguagePreference,
    completionCelebrationsEnabled: boolean,
    softGlassLevel: GlassLevelPreference,
    highlightGlassLevel: GlassLevelPreference,
    persist: boolean,
  ) => {
    const resolvedTheme = resolveTheme(theme);

    set({
      theme,
      resolvedTheme,
      language,
      completionCelebrationsEnabled,
      softGlassLevel,
      highlightGlassLevel,
      initialized: true,
    });
    applyTheme(resolvedTheme);
    applyGlassLevels(softGlassLevel, highlightGlassLevel);

    if (theme === "system") {
      startSystemThemeListener();
    } else {
      stopSystemThemeListener();
    }

    if (persist) {
      persistPreferences(theme, language, completionCelebrationsEnabled, softGlassLevel, highlightGlassLevel);
    }
  };

  return {
    ...initialState(),
    loadPreferences: () => {
      const next = readPersistedPreferences();
      commitPreferences(
        next.theme,
        next.language,
        next.completionCelebrationsEnabled,
        next.softGlassLevel,
        next.highlightGlassLevel,
        false,
      );
    },
    setTheme: (theme) => {
      commitPreferences(
        theme,
        get().language,
        get().completionCelebrationsEnabled,
        get().softGlassLevel,
        get().highlightGlassLevel,
        true,
      );
    },
    setLanguage: (language) => {
      commitPreferences(
        get().theme,
        language,
        get().completionCelebrationsEnabled,
        get().softGlassLevel,
        get().highlightGlassLevel,
        true,
      );
    },
    setCompletionCelebrationsEnabled: (completionCelebrationsEnabled) => {
      commitPreferences(
        get().theme,
        get().language,
        completionCelebrationsEnabled,
        get().softGlassLevel,
        get().highlightGlassLevel,
        true,
      );
    },
    setSoftGlassLevel: (softGlassLevel) => {
      commitPreferences(
        get().theme,
        get().language,
        get().completionCelebrationsEnabled,
        softGlassLevel,
        get().highlightGlassLevel,
        true,
      );
    },
    setHighlightGlassLevel: (highlightGlassLevel) => {
      commitPreferences(
        get().theme,
        get().language,
        get().completionCelebrationsEnabled,
        get().softGlassLevel,
        highlightGlassLevel,
        true,
      );
    },
    resetPreferences: () => {
      commitPreferences(
        DEFAULT_THEME,
        DEFAULT_LANGUAGE,
        DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
        DEFAULT_GLASS_LEVEL,
        DEFAULT_GLASS_LEVEL,
        true,
      );
    },
  };
};

export const createPreferencesStore = () => createStore<PreferencesStore>()(createPreferencesStoreState);

export const usePreferencesStore: UseBoundStore<StoreApi<PreferencesStore>> =
  create<PreferencesStore>()(createPreferencesStoreState);

export const resetPreferencesStore = () => {
  usePreferencesStore.setState(initialState());
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-soft-glass");
  document.documentElement.removeAttribute("data-highlight-glass");
};
