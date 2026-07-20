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
  /** Frosting of the buttons + sliders/pills. */
  controlGlassLevel: GlassLevelPreference;
  /** Frosting of the three big glass panels. */
  panelGlassLevel: GlassLevelPreference;
  /** Depth of the panel/card shadows, percent; 100 = designed. */
  panelShadowStrength: number;
  /** Depth of the button/slider shadows, percent; 100 = designed. */
  controlShadowStrength: number;
  initialized: boolean;
};

/** The slice of preferences that round-trips through localStorage. */
type PersistedPreferences = Pick<
  PreferencesState,
  | "theme"
  | "language"
  | "completionCelebrationsEnabled"
  | "reminderSoundEnabled"
  | "controlGlassLevel"
  | "panelGlassLevel"
  | "panelShadowStrength"
  | "controlShadowStrength"
>;

type PreferencesActions = {
  loadPreferences: () => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setCompletionCelebrationsEnabled: (enabled: boolean) => void;
  setReminderSoundEnabled: (enabled: boolean) => void;
  setControlGlassLevel: (level: GlassLevelPreference) => void;
  setPanelGlassLevel: (level: GlassLevelPreference) => void;
  setPanelShadowStrength: (strength: number) => void;
  setControlShadowStrength: (strength: number) => void;
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

export const SHADOW_STRENGTH_MIN = 0;
export const SHADOW_STRENGTH_MAX = 200;
const DEFAULT_SHADOW_STRENGTH = 100;

const isShadowStrength = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= SHADOW_STRENGTH_MIN &&
  value <= SHADOW_STRENGTH_MAX;

const clampShadowStrength = (value: number) =>
  Math.round(Math.min(Math.max(value, SHADOW_STRENGTH_MIN), SHADOW_STRENGTH_MAX));

const DEFAULT_REMINDER_SOUND_ENABLED = true;

const initialState = (): PreferencesState => ({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  language: DEFAULT_LANGUAGE,
  completionCelebrationsEnabled: DEFAULT_COMPLETION_CELEBRATIONS_ENABLED,
  reminderSoundEnabled: DEFAULT_REMINDER_SOUND_ENABLED,
  controlGlassLevel: DEFAULT_GLASS_LEVEL,
  panelGlassLevel: DEFAULT_GLASS_LEVEL,
  panelShadowStrength: DEFAULT_SHADOW_STRENGTH,
  controlShadowStrength: DEFAULT_SHADOW_STRENGTH,
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
  controlGlassLevel: DEFAULT_GLASS_LEVEL,
  panelGlassLevel: DEFAULT_GLASS_LEVEL,
  panelShadowStrength: DEFAULT_SHADOW_STRENGTH,
  controlShadowStrength: DEFAULT_SHADOW_STRENGTH,
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
      shadowStrength?: unknown;
      controlGlassLevel?: unknown;
      panelGlassLevel?: unknown;
      panelShadowStrength?: unknown;
      controlShadowStrength?: unknown;
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
      typeof parsed.version === "number" &&
      parsed.version >= 3 &&
      parsed.version <= 6 &&
      typeof parsed.completionCelebrationsEnabled === "boolean"
    ) {
      // v3-v5 stored soft/highlight glass + a single shadowStrength; v6 renamed
      // them to control/panel glass + two shadow sliders. Carry old values over:
      // the merged control glass inherits the old soft-glass level, panel glass
      // starts at the default, and the old single shadow becomes the panel shadow.
      const controlGlassLevel = isGlassLevelPreference(parsed.controlGlassLevel)
        ? parsed.controlGlassLevel
        : isGlassLevelPreference(parsed.softGlassLevel)
          ? parsed.softGlassLevel
          : DEFAULT_GLASS_LEVEL;
      const panelShadowStrength = isShadowStrength(parsed.panelShadowStrength)
        ? parsed.panelShadowStrength
        : isShadowStrength(parsed.shadowStrength)
          ? parsed.shadowStrength
          : DEFAULT_SHADOW_STRENGTH;
      return {
        theme: parsed.theme,
        language: parsed.language,
        completionCelebrationsEnabled: parsed.completionCelebrationsEnabled,
        reminderSoundEnabled:
          typeof parsed.reminderSoundEnabled === "boolean" ? parsed.reminderSoundEnabled : DEFAULT_REMINDER_SOUND_ENABLED,
        controlGlassLevel,
        panelGlassLevel: isGlassLevelPreference(parsed.panelGlassLevel) ? parsed.panelGlassLevel : DEFAULT_GLASS_LEVEL,
        panelShadowStrength,
        controlShadowStrength: isShadowStrength(parsed.controlShadowStrength)
          ? parsed.controlShadowStrength
          : DEFAULT_SHADOW_STRENGTH,
      };
    }

    return defaultPersistedPreferences();
  } catch {
    return defaultPersistedPreferences();
  }
};

const persistPreferences = (preferences: PersistedPreferences) => {
  try {
    getStorage()?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 6, ...preferences }));
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

const applyPanelShadowStrength = (strength: number) => {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--panel-shadow-strength", String(strength / 100));
  }
};

const applyControlShadowStrength = (strength: number) => {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--control-shadow-strength", String(strength / 100));
  }
};

const applyGlassLevels = (controlGlassLevel: GlassLevelPreference, panelGlassLevel: GlassLevelPreference) => {
  if (typeof document !== "undefined") {
    // One control governs both the pills/sliders (data-soft-glass) and the
    // buttons (data-highlight-glass) frosting.
    document.documentElement.dataset.softGlass = controlGlassLevel;
    document.documentElement.dataset.highlightGlass = controlGlassLevel;
    document.documentElement.dataset.panelGlass = panelGlassLevel;
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
    controlGlassLevel: get().controlGlassLevel,
    panelGlassLevel: get().panelGlassLevel,
    panelShadowStrength: get().panelShadowStrength,
    controlShadowStrength: get().controlShadowStrength,
  });

  const commitPreferences = (preferences: PersistedPreferences, persist: boolean) => {
    const resolvedTheme = resolveTheme(preferences.theme);

    set({
      ...preferences,
      resolvedTheme,
      initialized: true,
    });
    applyTheme(resolvedTheme);
    applyGlassLevels(preferences.controlGlassLevel, preferences.panelGlassLevel);
    applyPanelShadowStrength(preferences.panelShadowStrength);
    applyControlShadowStrength(preferences.controlShadowStrength);

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
    setPanelShadowStrength: (panelShadowStrength) => {
      commitPreferences({ ...currentPersisted(), panelShadowStrength: clampShadowStrength(panelShadowStrength) }, true);
    },
    setControlShadowStrength: (controlShadowStrength) => {
      commitPreferences({ ...currentPersisted(), controlShadowStrength: clampShadowStrength(controlShadowStrength) }, true);
    },
    setControlGlassLevel: (controlGlassLevel) => {
      commitPreferences({ ...currentPersisted(), controlGlassLevel }, true);
    },
    setPanelGlassLevel: (panelGlassLevel) => {
      commitPreferences({ ...currentPersisted(), panelGlassLevel }, true);
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
