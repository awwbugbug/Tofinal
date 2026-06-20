import { Settings, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/useI18n";
import {
  usePreferencesStore,
  type GlassLevelPreference,
  type LanguagePreference,
  type ThemePreference,
} from "@/stores/preferencesStore";

type PreferencesPanelProps = {
  open: boolean;
  onClose: () => void;
};

const themeOptions: Array<{ value: ThemePreference; labelKey: string }> = [
  { value: "light", labelKey: "settings.themeLight" },
  { value: "dark", labelKey: "settings.themeDark" },
  { value: "system", labelKey: "settings.themeSystem" },
];

const languageOptions: Array<{ value: LanguagePreference; labelKey: string }> = [
  { value: "zh-CN", labelKey: "settings.languageChinese" },
  { value: "en-US", labelKey: "settings.languageEnglish" },
];

const glassLevelOptions: Array<{ value: GlassLevelPreference; labelKey: string }> = [
  { value: "subtle", labelKey: "settings.glassSubtle" },
  { value: "standard", labelKey: "settings.glassStandard" },
  { value: "strong", labelKey: "settings.glassStrong" },
];

export function PreferencesPanel({ onClose, open }: PreferencesPanelProps) {
  const { t } = useI18n();
  const theme = usePreferencesStore((state) => state.theme);
  const language = usePreferencesStore((state) => state.language);
  const completionCelebrationsEnabled = usePreferencesStore((state) => state.completionCelebrationsEnabled);
  const softGlassLevel = usePreferencesStore((state) => state.softGlassLevel);
  const highlightGlassLevel = usePreferencesStore((state) => state.highlightGlassLevel);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const setCompletionCelebrationsEnabled = usePreferencesStore((state) => state.setCompletionCelebrationsEnabled);
  const setSoftGlassLevel = usePreferencesStore((state) => state.setSoftGlassLevel);
  const setHighlightGlassLevel = usePreferencesStore((state) => state.setHighlightGlassLevel);
  const resetPreferences = usePreferencesStore((state) => state.resetPreferences);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-label={t("settings.title")}
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(23_32_51_/_0.24)] px-5 backdrop-blur-sm"
      role="dialog"
    >
      <section className="w-full max-w-sm rounded-[28px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-detail)_94%,transparent)] p-5 shadow-[var(--shadow-soft)]">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-[var(--text-faint)]">
              <Settings className="h-3.5 w-3.5" />
              {t("settings.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{t("settings.description")}</p>
          </div>
          <Button
            aria-label={t("settings.close")}
            edgeSafe
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="mt-5 space-y-5">
          <section aria-labelledby="preferences-theme-label" className="space-y-2">
            <div className="text-xs font-medium uppercase text-[var(--text-faint)]" id="preferences-theme-label">
              {t("settings.theme")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((option) => {
                const selected = theme === option.value;

                return (
                  <button
                    aria-pressed={selected}
                    className={cn("preferences-choice", selected && "glass-soft preferences-choice-selected")}
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    type="button"
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="preferences-language-label" className="space-y-2">
            <div className="text-xs font-medium uppercase text-[var(--text-faint)]" id="preferences-language-label">
              {t("settings.language")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {languageOptions.map((option) => {
                const selected = language === option.value;

                return (
                  <button
                    aria-pressed={selected}
                    className={cn("preferences-choice", selected && "glass-soft preferences-choice-selected")}
                    key={option.value}
                    onClick={() => setLanguage(option.value)}
                    type="button"
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="preferences-glass-label" className="space-y-3">
            <div className="text-xs font-medium uppercase text-[var(--text-faint)]" id="preferences-glass-label">
              {t("settings.glass")}
            </div>
            <div className="space-y-3 rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-field)] p-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--text-muted)]">{t("settings.softGlass")}</div>
                <div className="grid grid-cols-3 gap-2">
                  {glassLevelOptions.map((option) => {
                    const selected = softGlassLevel === option.value;

                    return (
                      <button
                        aria-label={`${t("settings.softGlass")} ${t(option.labelKey)}`}
                        aria-pressed={selected}
                        className={cn("preferences-choice", selected && "glass-soft preferences-choice-selected")}
                        key={option.value}
                        onClick={() => setSoftGlassLevel(option.value)}
                        type="button"
                      >
                        {t(option.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--text-muted)]">{t("settings.buttonGlass")}</div>
                <div className="grid grid-cols-3 gap-2">
                  {glassLevelOptions.map((option) => {
                    const selected = highlightGlassLevel === option.value;

                    return (
                      <button
                        aria-label={`${t("settings.buttonGlass")} ${t(option.labelKey)}`}
                        aria-pressed={selected}
                        className={cn("preferences-choice", selected && "glass-soft preferences-choice-selected")}
                        key={option.value}
                        onClick={() => setHighlightGlassLevel(option.value)}
                        type="button"
                      >
                        {t(option.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="preferences-completion-effects-label" className="space-y-2">
            <div className="text-xs font-medium uppercase text-[var(--text-faint)]" id="preferences-completion-effects-label">
              {t("settings.effects")}
            </div>
            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-field)] px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {t("settings.completionCelebrations")}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {t("settings.completionCelebrationsDescription")}
                </p>
              </div>
              <Checkbox
                aria-label={t("settings.completionCelebrations")}
                checked={completionCelebrationsEnabled}
                className="mt-0.5"
                onChange={(event) => setCompletionCelebrationsEnabled(event.currentTarget.checked)}
              />
            </label>
          </section>
        </div>

        <footer className="mt-6 flex justify-start">
          <Button onClick={resetPreferences} type="button" variant="secondary">
            {t("settings.reset")}
          </Button>
        </footer>
      </section>
    </div>
  );
}
