import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPreferencesStore, PREFERENCES_STORAGE_KEY } from "@/stores/preferencesStore";

type MatchMediaListener = (event: { matches: boolean }) => void;

const installMatchMedia = (initialMatches: boolean) => {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaListener>();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: (_event: "change", listener: MatchMediaListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: "change", listener: MatchMediaListener) => {
        listeners.delete(listener);
      },
    })),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches }));
    },
  };
};

describe("preferences store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    installMatchMedia(false);
  });

  it("loads default preferences and applies the resolved light theme", () => {
    const store = createPreferencesStore();

    store.getState().loadPreferences();

    expect(store.getState()).toMatchObject({
      theme: "system",
      resolvedTheme: "light",
      language: "zh-CN",
      completionCelebrationsEnabled: true,
      softGlassLevel: "standard",
      highlightGlassLevel: "standard",
      initialized: true,
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.softGlass).toBe("standard");
    expect(document.documentElement.dataset.highlightGlass).toBe("standard");
  });

  it("loads valid preferences from localStorage", () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        theme: "dark",
        language: "en-US",
        completionCelebrationsEnabled: false,
        softGlassLevel: "subtle",
        highlightGlassLevel: "strong",
      }),
    );
    const store = createPreferencesStore();

    store.getState().loadPreferences();

    expect(store.getState().theme).toBe("dark");
    expect(store.getState().resolvedTheme).toBe("dark");
    expect(store.getState().language).toBe("en-US");
    expect(store.getState().completionCelebrationsEnabled).toBe(false);
    expect(store.getState().softGlassLevel).toBe("subtle");
    expect(store.getState().highlightGlassLevel).toBe("strong");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.softGlass).toBe("subtle");
    expect(document.documentElement.dataset.highlightGlass).toBe("strong");
  });

  it("migrates version 1 preferences by enabling completion celebrations and glass defaults", () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, theme: "dark", language: "en-US" }),
    );
    const store = createPreferencesStore();

    store.getState().loadPreferences();

    expect(store.getState()).toMatchObject({
      theme: "dark",
      language: "en-US",
      completionCelebrationsEnabled: true,
      softGlassLevel: "standard",
      highlightGlassLevel: "standard",
    });
  });

  it("migrates version 2 preferences by adding glass defaults", () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 2, theme: "dark", language: "en-US", completionCelebrationsEnabled: false }),
    );
    const store = createPreferencesStore();

    store.getState().loadPreferences();

    expect(store.getState()).toMatchObject({
      theme: "dark",
      language: "en-US",
      completionCelebrationsEnabled: false,
      softGlassLevel: "standard",
      highlightGlassLevel: "standard",
    });
  });

  it("falls back to defaults for invalid localStorage JSON and invalid values", () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, "{broken");
    const brokenJsonStore = createPreferencesStore();

    brokenJsonStore.getState().loadPreferences();

    expect(brokenJsonStore.getState().theme).toBe("system");
    expect(brokenJsonStore.getState().language).toBe("zh-CN");
    expect(brokenJsonStore.getState().completionCelebrationsEnabled).toBe(true);
    expect(brokenJsonStore.getState().softGlassLevel).toBe("standard");
    expect(brokenJsonStore.getState().highlightGlassLevel).toBe("standard");

    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, theme: "blue", language: "fr-FR" }),
    );
    const invalidValuesStore = createPreferencesStore();

    invalidValuesStore.getState().loadPreferences();

    expect(invalidValuesStore.getState().theme).toBe("system");
    expect(invalidValuesStore.getState().language).toBe("zh-CN");
    expect(invalidValuesStore.getState().completionCelebrationsEnabled).toBe(true);
    expect(invalidValuesStore.getState().softGlassLevel).toBe("standard");
    expect(invalidValuesStore.getState().highlightGlassLevel).toBe("standard");
  });

  it("persists theme, language, celebration, and glass updates without routing through task persistence", () => {
    const store = createPreferencesStore();
    store.getState().loadPreferences();

    store.getState().setTheme("dark");
    store.getState().setLanguage("en-US");
    store.getState().setCompletionCelebrationsEnabled(false);
    store.getState().setSoftGlassLevel("subtle");
    store.getState().setHighlightGlassLevel("strong");

    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}")).toMatchObject({
      version: 3,
      theme: "dark",
      language: "en-US",
      completionCelebrationsEnabled: false,
      softGlassLevel: "subtle",
      highlightGlassLevel: "strong",
    });
    expect(store.getState().resolvedTheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.softGlass).toBe("subtle");
    expect(document.documentElement.dataset.highlightGlass).toBe("strong");
  });

  it("resets preferences to defaults and persists the reset", () => {
    const systemTheme = installMatchMedia(true);
    const store = createPreferencesStore();
    store.getState().loadPreferences();
    store.getState().setTheme("light");
    store.getState().setLanguage("en-US");
    store.getState().setSoftGlassLevel("strong");
    store.getState().setHighlightGlassLevel("subtle");

    store.getState().resetPreferences();

    expect(store.getState()).toMatchObject({
      theme: "system",
      resolvedTheme: "dark",
      language: "zh-CN",
      completionCelebrationsEnabled: true,
      softGlassLevel: "standard",
      highlightGlassLevel: "standard",
    });
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}")).toMatchObject({
      version: 3,
      theme: "system",
      language: "zh-CN",
      completionCelebrationsEnabled: true,
      softGlassLevel: "standard",
      highlightGlassLevel: "standard",
    });

    systemTheme.setMatches(false);
    expect(store.getState().resolvedTheme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("resolves system theme changes while in system mode only", () => {
    const systemTheme = installMatchMedia(false);
    const store = createPreferencesStore();
    store.getState().loadPreferences();

    systemTheme.setMatches(true);
    expect(store.getState().resolvedTheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    store.getState().setTheme("light");
    systemTheme.setMatches(false);
    systemTheme.setMatches(true);

    expect(store.getState().resolvedTheme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("uses defaults when localStorage and matchMedia are unavailable", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = createPreferencesStore();

    store.getState().loadPreferences();
    store.getState().setTheme("dark");

    expect(store.getState().initialized).toBe(true);
    expect(store.getState().theme).toBe("dark");
    expect(store.getState().resolvedTheme).toBe("dark");
    expect(store.getState().softGlassLevel).toBe("standard");
    expect(store.getState().highlightGlassLevel).toBe("standard");
    expect(document.documentElement.dataset.theme).toBe("dark");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
