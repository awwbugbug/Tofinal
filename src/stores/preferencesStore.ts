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
  reminderSoundEnabled: boolean;
  softGlassLevel: GlassLevelPreference;
  highlightGlassLevel: GlassLevelPreference;
  initialized: boolean;
};

/** The slice of preferences that round-trips through localStorage. */
type PersistedPreferences = Pick<
  PreferencesState,
  "theme" | "language" | "completionCelebrationsEnabled" | "reminderSoundEnabled" | "softGlassLevel" | "highlightGlassLevel"
>;

type PreferencesActions = {
  loadPreferences: () => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setCompletionCelebrationsEnabled: (enabled: boolean) => void;
  setReminderSoundEnabled: (enabled: boolean) => void;
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

const DEFAULT_REMINDER_SOUND_ENABLED = true;

const initialState = (): PreferencesState => ({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  language: DEFAULT_LANGUAGE,
  completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
  reminderSoundEnabled: DEFAULT_REMINDER_SOUND_ENABLED,
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

const defaultPersistedPreferences = (): PersistedPreferences => ({
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
  reminderSoundEnabled: DEFAULT_REMINDER_SOUND_ENABLED,
  softGlassLevel: DEFAULT_GLASS_LEVEL,
  highlightGlassLevel: DEFAULT_GLASS_LEVEL,
});

const readPersistedPreferences = (): PersistedPreferences => {
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
      reminderSoundEnabled?: unknown;
      softGlassLevel?: unknown;
      highlightGlassLevel?: unknown;
    };
    if (!isThemePreference(parsed.theme) || !isLanguagePreference(parsed.language)) {
      return defaultPersistedPreferences();
    }

    if (parsed.version === 1) {
      return {
        ...defaultPersistedPreferences(),
        theme: parsed.theme,
        language: parsed.language,
      };
    }

    if (parsed.version === 2 && typeof parsed.completionCelebrationsEnabled === "boolean") {
      return {
        ...defaultPersistedPreferences(),
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: parsed.completionCelebrationsEnabled,
      };
    }

    if (
      (parsed.version === 3 || parsed.version === 4) &&
      typeof parsed.completionCelebrationsEnabled === "boolean" &&
      isGlassLevelPreference(parsed.softGlassLevel) &&
      isGlassLevelPreference(parsed.highlightGlassLevel)
    ) {
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: parsed.completionCelebrationsEnabled,
        // v3 payloads predate the reminder toggle; default it on.
        reminderSoundEnabled:
          typeof parsed.reminderSoundEnabled === "boolean" ? parsed.reminderSoundEnabled : DEFAULT_REMINDER_SOUND_ENABLED,
        softGlassLevel: parsed.softGlassLevel,
        highlightGlassLevel: parsed.highlightGlassLevel,
      };
    }

    return defaultPersistedPreferences();
  } catch {
    return defaultPersistedPreferences();
  }
};

const persistPreferences = (preferences: PersistedPreferences) => {
  try {
    getStorage()?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 4, ...preferences }));
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

  const currentPersisted = (): PersistedPreferences => ({
    theme: get().theme,
    language: get().language,
    completionCelebrationsEnabled: get().completionCelebrationsEnabled,
    reminderSoundEnabled: get().reminderSoundEnabled,
    softGlassLevel: get().softGlassLevel,
    highlightGlassLevel: get().highlightGlassLevel,
  });

  const commitPreferences = (preferences: PersistedPreferences, persist: boolean) => {
    const resolvedTheme = resolveTheme(preferences.theme);

    set({
      ...preferences,
      resolvedTheme,
      initialized: true,
    });
    applyTheme(resolvedTheme);
    applyGlassLevels(preferences.softGlassLevel, preferences.highlightGlassLevel);

    if (preferences.theme === "system") {
      startSystemThemeListener();
    } else {
      stopSystemThemeListener();
    }

    if (persist) {
      persistPreferences(preferences);
    }
  };

  return {
    ...initialState(),
    loadPreferences: () => {
      commitPreferences(readPersistedPreferences(), false);
    },
    setTheme: (theme) => {
      commitPreferences({ ...currentPersisted(), theme }, true);
    },
    setLanguage: (language) => {
      commitPreferences({ ...currentPersisted(), language }, true);
    },
    setCompletionCelebrationsEnabled: (completionCelebrationsEnabled) => {
      commitPreferences({ ...currentPersisted(), completionCelebrationsEnabled }, true);
    },
    setReminderSoundEnabled: (reminderSoundEnabled) => {
      commitPreferences({ ...currentPersisted(), reminderSoundEnabled }, true);
    },
    setSoftGlassLevel: (softGlassLevel) => {
      commitPreferences({ ...currentPersisted(), softGlassLevel }, true);
    },
    setHighlightGlassLevel: (highlightGlassLevel) => {
      commitPreferences({ ...currentPersisted(), highlightGlassLevel }, true);
    },
    resetPreferences: () => {
      commitPreferences(defaultPersistedPreferences(), true);
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
