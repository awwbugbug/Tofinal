# ToFinal Phase 7A Preferences Foundation Design

Date: 2026-06-16

## 1. Current Baseline State

Current stable baseline: `v0.6c-screenshot-editor-baseline`.

The app already has:

- Task CRUD.
- SQLite task persistence.
- Image attachment metadata and local AppData file storage.
- Image import, preview, delete, and Lightbox.
- Screenshot capture through the unified Screenshot entry.
- Screenshot Editor MVP with confirm without crop and confirm with crop.
- Task app binding.
- User-triggered Start Task.
- Normal Window Mode and Desktop Pin Mode.
- Local-first architecture.

The app does not currently have:

- Theme switching.
- Dark mode.
- System theme following.
- Language switching.
- Settings or preferences UI.
- Cloud sync.
- User account.
- AI.
- MCP.

Phase 7A is design-only. It defines the preferences foundation for Phase 7B implementation of Light / Dark / System theme selection and Chinese / English UI language selection.

## 2. Phase 7A Scope

Phase 7A designs:

- Preferences data model.
- Theme preference.
- Language preference.
- Persistence strategy.
- Store design.
- Minimal UI entry.
- CSS and theme token strategy.
- i18n text organization.
- Error handling.
- Test plan.
- Phase 7B acceptance criteria.

Phase 7A does not design or implement:

- AI.
- MCP.
- Voice input.
- User account.
- Cloud sync.
- Online translation.
- Automatic language detection beyond an optional default-language decision.
- Large-scale multilingual backend management.
- Full plugin system.
- SQLite schema changes.
- New dependencies.
- UI redesign.

## 3. Preferences MVP

Theme preference supports:

- `light`
- `dark`
- `system`

Language preference supports:

- `zh-CN`
- `en-US`

Default values:

- Default `theme` should be `system`.
- Default `language` should be `zh-CN`.

Recommendation for language default:

- Use `zh-CN` as the Phase 7B default, even when the browser or OS language is different.
- Reasoning: the current product brief, development notes, and primary workflow language are Chinese. A fixed default avoids surprising first-run behavior and keeps Phase 7B small.
- Browser or OS language following can be added later after the manual language switcher is stable.

Persistence rules:

- A manual user selection must be persisted.
- Restarting ToFinal must keep the selected theme and language.
- Preference read/write failure must not block app startup.
- Preferences must not change task content, task metadata, attachments, app bindings, or screenshot files.

## 4. Persistence Strategy Comparison

| Option | Implementation complexity | Needs schema migration | Affects core task data | Suitable for UI preferences | Later migration cost | Test difficulty |
| --- | --- | --- | --- | --- | --- | --- |
| A. `localStorage` | Low | No | No | Good for small local UI preferences | Low to medium if account sync arrives | Low |
| B. SQLite settings table | Medium | Yes | Shares database lifecycle with task data | Good for durable app settings, but heavier for Phase 7B | Low if sync later uses SQLite as source | Medium |
| C. Tauri store/plugin | Medium | No SQLite migration, but adds plugin/dependency surface | No direct task impact | Good for app settings, but not currently installed | Medium if replaced later | Medium |

### Recommendation

Use `localStorage` first for preferences.

Rules:

- Store preferences separately from `tofinal.tasks.v1`.
- Do not modify the SQLite schema.
- Do not mix UI preferences into task persistence.
- Do not put preferences in `taskStore`.
- If future account sync is introduced, design an explicit migration from local-only preferences to a synced profile/settings model.

Recommended key:

```text
tofinal.preferences.v1
```

Recommended persisted payload:

```ts
type PersistedPreferencesV1 = {
  version: 1;
  theme: ThemePreference;
  language: LanguagePreference;
};
```

## 5. Preferences Type Design

Recommended types:

```ts
type ThemePreference = "light" | "dark" | "system";
type LanguagePreference = "zh-CN" | "en-US";

type PreferencesState = {
  theme: ThemePreference;
  language: LanguagePreference;
};
```

Rules:

- `theme` controls UI color rendering.
- `language` controls UI text.
- `language` does not control task content translation.
- Do not automatically translate user-entered task titles, notes, or tags.
- Do not automatically translate attachment `original_name`.
- Do not automatically translate task app `app_name`.
- Do not change task data shape for preferences.

## 6. Store Design

Recommended new file:

```text
src/stores/preferencesStore.ts
```

Recommended store state:

```ts
type PreferencesStoreState = {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  language: LanguagePreference;
  initialized: boolean;
};
```

Recommended actions:

- `loadPreferences()`
- `setTheme(theme)`
- `setLanguage(language)`
- `resetPreferences()`

Store rules:

- `theme` is the user-selected preference.
- `resolvedTheme` is the effective runtime theme and can only be `light` or `dark`.
- UI should read `resolvedTheme` for visual rendering.
- `system` mode resolves through `window.matchMedia("(prefers-color-scheme: dark)")`.
- The store should listen for system theme changes only when the selected `theme` is `system`.
- localStorage read/write failures should fall back to defaults and keep the app usable.
- `initialized` should become `true` after the store has attempted to load preferences, even if loading failed.
- Do not place preferences in `taskStore`.
- Do not route preferences through the task save queue.
- Do not call task repositories from the preferences store.

Recommended startup flow:

```text
App startup
-> loadPreferences()
-> validate persisted values
-> resolve theme
-> apply data-theme to document.documentElement
-> render existing app shell
```

## 7. Theme Implementation Strategy

Use CSS variables / design tokens.

Recommended document attribute:

```text
document.documentElement.dataset.theme = "light"
document.documentElement.dataset.theme = "dark"
```

Rules:

- `theme = "system"` should resolve to `data-theme="light"` or `data-theme="dark"`.
- The DOM should not use `data-theme="system"`.
- Prefer updating existing CSS variables instead of rewriting component classes.
- Do not add separate `dark` classes to every component.
- Do not redesign the three-column app layout.
- Do not change Normal Mode or Desktop Pin Mode structure.
- Keep the current visual language and only introduce tokenized light/dark values.

Token coverage required for Phase 7B:

- App background.
- Window chrome.
- Sidebar.
- Task list.
- Detail panel.
- Cards.
- Inputs.
- Buttons.
- Badges.
- Priority indicators.
- Pinned state.
- Error and success states.
- Overlays.
- Lightbox.
- Screenshot Editor.
- Scrollbars.
- Focus rings.
- Selection states.

Design read for the settings surface:

- Utility desktop app, not marketing UI.
- Existing soft, glass-influenced token system should be preserved.
- `DESIGN_VARIANCE = 3`, `MOTION_INTENSITY = 2`, `VISUAL_DENSITY = 6`.
- Preferences UI should feel like part of the existing app shell, not a new product surface.

## 8. Language / i18n Strategy

Compare options:

| Option | Implementation complexity | Fit for current project size | Dependency cost | Type safety | Test difficulty | Expansion cost |
| --- | --- | --- | --- | --- | --- | --- |
| A. Lightweight dictionary | Low | Good | None | Good if keys are typed | Low | Medium if many languages arrive |
| B. `react-i18next` | Medium | More than Phase 7B needs | New dependency | Good with setup | Medium | Low for larger multilingual app |
| C. Other i18n library | Medium | Unclear benefit now | New dependency | Depends on library | Medium | Depends on library |

### Recommendation

Use a lightweight dictionary for the MVP and add no dependencies.

Recommended files:

```text
src/i18n/messages.ts
src/i18n/useI18n.ts
```

Recommended rules:

- Use key-based UI text.
- Centralize Chinese and English text in `messages.ts`.
- Do not scatter hard-coded translated labels across components.
- Start with the main UI surfaces and current attachment/screenshot/app-binding workflows.
- Missing keys should return the key or a clear fallback string in development/test.
- Date and time localization can be deferred unless a visible label is already easy to format safely.

Do not translate user data:

- Task title.
- Task note.
- Task tags.
- Attachment `original_name`.
- Task app `app_name`.

Error text policy:

- Translate core user-facing errors where practical.
- Preserve lower-level technical error details when useful for diagnostics.
- Do not hide original errors from developers or tests.

## 9. Minimal UI Boundary

Phase 7B should add the smallest settings entry that supports preferences without reworking the app.

Recommended placement:

- Add a settings entry in the existing app chrome or Sidebar area where it does not interfere with task filters, task editing, or Desktop Pin Mode.
- The entry should open a compact settings panel, popover, or modal-style surface.
- The settings surface should be available in Normal Mode.
- Desktop Pin Mode should not be redesigned; if a settings entry is exposed there, it must not block quick task entry.

Required controls:

- Theme selector with `Light`, `Dark`, `System`.
- Language selector with `Chinese`, `English`.
- Current selected state.
- Close or Back action.

Behavior:

- Changes apply immediately.
- No restart is required.
- Narrow DetailPanel widths must not clip controls.
- Settings must not block task editing once closed.
- Settings must not change the three-column structure.
- Settings must not affect Desktop Pin Mode behavior.

This phase only describes function and boundaries. It does not prescribe final aesthetics.

## 10. Error Handling

Phase 7B must handle:

- `localStorage` unavailable.
- `localStorage` read throws.
- `localStorage` write throws.
- Preference JSON parse failure.
- Invalid `theme` value.
- Invalid `language` value.
- Missing `window.matchMedia`.
- System theme listener unavailable.
- System theme changes while `theme = "system"`.
- Missing i18n key.
- Language switch does not update a visible label.
- Theme switch causes Lightbox styling regression.
- Theme switch causes Screenshot Editor styling regression.
- Theme switch causes overlay contrast regression.

Required behavior:

- Fall back to default preferences.
- Do not block app startup.
- Do not corrupt task data.
- Do not touch SQLite.
- Do not affect the task save queue.
- Keep current tasks, attachments, screenshots, and app bindings usable.

## 11. Test Plan

Phase 7B should include tests for:

- Default preferences.
- Load from localStorage.
- Invalid localStorage JSON fallback.
- Invalid theme fallback.
- Invalid language fallback.
- `setTheme` persists.
- `setLanguage` persists.
- `resetPreferences` restores defaults and persists them.
- System theme resolves to light.
- System theme resolves to dark.
- System theme listener updates `resolvedTheme`.
- Theme applies `data-theme` to `document.documentElement`.
- Language change updates visible labels.
- Missing i18n key fallback.
- Settings entry opens and closes.
- Theme selector shows current selection.
- Language selector shows current selection.
- Lightbox still opens in dark mode.
- Screenshot Editor still opens in dark mode.
- Image attachment import/preview/delete regression.
- Screenshot editor confirm without crop regression.
- Screenshot editor confirm with crop regression.
- Task app binding regression.
- Start Task regression.
- Task CRUD regression.
- Task save queue regression.

Manual QA should include:

- First launch with no preferences.
- Restart after selecting Light.
- Restart after selecting Dark.
- Restart after selecting System.
- OS theme switch while ToFinal is running in System mode.
- Switch Chinese to English and back.
- Narrow Normal Mode DetailPanel width.
- Desktop Pin Mode task entry after preferences have changed.

## 12. Phase 7B Acceptance Criteria

Phase 7B is acceptable when:

- `npm test` passes.
- `npm run build` passes.
- `cargo check` passes.
- `npm run tauri dev` starts the desktop app.
- User can switch Light / Dark / System.
- Restarting ToFinal keeps the selected theme.
- System mode follows the system light/dark preference.
- User can switch Chinese / English.
- Restarting ToFinal keeps the selected language.
- Main UI labels switch correctly.
- User-entered content is not automatically translated.
- Image attachments still work.
- Lightbox still works.
- Screenshot Editor still works.
- Task app binding still works.
- Start Task still works.
- Task CRUD still works.
- Task save queue still works.
- SQLite schema is not modified.
- No new dependencies are added.
- Git working tree does not contain unexpected generated files such as databases, screenshots, or build artifacts.

## 13. Future Enhancements

These are explicitly outside Phase 7B:

- More languages.
- Browser or OS language defaulting.
- Date and time localization.
- Custom theme colors.
- High contrast mode.
- Font size preference.
- Preference sync.
- Profile or account settings.
- MCP integration.
- Internal AI API integration.

Future preference expansion should keep the same boundary:

```text
UI controls
-> preferencesStore
-> local preference persistence
-> document/theme and dictionary consumers
```

Task data, attachments, screenshots, and app bindings should remain separate from UI preferences unless a later account/profile phase explicitly changes that architecture.
