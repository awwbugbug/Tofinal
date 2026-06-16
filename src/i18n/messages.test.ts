import { describe, expect, it } from "vitest";

import { createTranslator, messages } from "@/i18n/messages";

describe("i18n messages", () => {
  it("translates known keys for Chinese and English", () => {
    expect(createTranslator("zh-CN")("filters.today")).toBe("今天");
    expect(createTranslator("en-US")("filters.today")).toBe("Today");
    expect(createTranslator("zh-CN")("settings.languageChinese")).toBe("中文");
    expect(createTranslator("en-US")("settings.languageEnglish")).toBe("English");
  });

  it("returns the key for missing translations", () => {
    expect(createTranslator("zh-CN")("missing.key")).toBe("missing.key");
    expect(createTranslator("en-US")("missing.key")).toBe("missing.key");
  });

  it("keeps language dictionaries on the same key set", () => {
    expect(Object.keys(messages["zh-CN"]).sort()).toEqual(Object.keys(messages["en-US"]).sort());
  });
});
