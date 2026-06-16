import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type ThemePreference = "light" | "dark" | "system";
export type LanguagePreference = "zh-CN" | "en-US";
export type ResolvedTheme = "light" | "dark";

type PreferencesState = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  language: LanguagePreference;
  completionCelebrationsEnabled: boolean;
  initialized: boolean;
};

type PreferencesActions = {
  loadPreferences: () => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setCompletionCelebrationsEnabled: (enabled: boolean) => void;
  resetPreferences: () => void;
};

export type PreferencesStore = PreferencesState & PreferencesActions;

export const PREFERENCES_STORAGE_KEY = "tofinal.preferences.v1";

const DEFAULT_THEME: ThemePreference = "system";
const DEFAULT_LANGUAGE: LanguagePreference = "zh-CN";
const DEFAULT_COMPLETION_CELEBRATIONS_ENABLED = true;

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

const isLanguagePreference = (value: unknown): value is LanguagePreference =>
  value === "zh-CN" || value === "en-US";

const initialState = (): PreferencesState => ({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  language: DEFAULT_LANGUAGE,
  completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
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

const readPersistedPreferences = (): Pick<PreferencesState, "theme" | "language" | "completionCelebrationsEnabled"> => {
  try {
    const raw = getStorage()?.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {
        theme: DEFAULT_THEME,
        language: DEFAULT_LANGUAGE,
        completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
      };
    }

    const parsed = JSON.parse(raw) as {
      version?: number;
      theme?: unknown;
      language?: unknown;
      completionCelebrationsEnabled?: unknown;
    };
    if (!isThemePreference(parsed.theme) || !isLanguagePreference(parsed.language)) {
      return {
        theme: DEFAULT_THEME,
        language: DEFAULT_LANGUAGE,
        completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
      };
    }

    if (parsed.version === 1) {
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
      };
    }

    if (parsed.version === 2 && typeof parsed.completionCelebrationsEnabled === "boolean") {
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: parsed.completionCelebrationsEnabled,
      };
    }

    return {
      theme: DEFAULT_THEME,
      language: DEFAULT_LANGUAGE,
      completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
    };
  } catch {
    return {
      theme: DEFAULT_THEME,
      language: DEFAULT_LANGUAGE,
      completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
    };
  }
};

const persistPreferences = (
  theme: ThemePreference,
  language: LanguagePreference,
  completionCelebrationsEnabled: boolean,
) => {
  try {
    getStorage()?.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 2, theme, language, completionCelebrationsEnabled }),
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
    persist: boolean,
  ) => {
    const resolvedTheme = resolveTheme(theme);

    set({ theme, resolvedTheme, language, completionCelebrationsEnabled, initialized: true });
    applyTheme(resolvedTheme);

    if (theme === "system") {
      startSystemThemeListener();
    } else {
      stopSystemThemeListener();
    }

    if (persist) {
      persistPreferences(theme, language, completionCelebrationsEnabled);
    }
  };

  return {
    ...initialState(),
    loadPreferences: () => {
      const next = readPersistedPreferences();
      commitPreferences(next.theme, next.language, next.completionCelebrationsEnabled, false);
    },
    setTheme: (theme) => {
      commitPreferences(theme, get().language, get().completionCelebrationsEnabled, true);
    },
    setLanguage: (language) => {
      commitPreferences(get().theme, language, get().completionCelebrationsEnabled, true);
    },
    setCompletionCelebrationsEnabled: (completionCelebrationsEnabled) => {
      commitPreferences(get().theme, get().language, completionCelebrationsEnabled, true);
    },
    resetPreferences: () => {
      commitPreferences(DEFAULT_THEME, DEFAULT_LANGUAGE, DEFAULT_COMPLETION_CELEBRATIONS_ENABLED, true);
    },
  };
};

export const createPreferencesStore = () => createStore<PreferencesStore>()(createPreferencesStoreState);

export const usePreferencesStore: UseBoundStore<StoreApi<PreferencesStore>> =
  create<PreferencesStore>()(createPreferencesStoreState);

export const resetPreferencesStore = () => {
  usePreferencesStore.setState(initialState());
  document.documentElement.removeAttribute("data-theme");
};
