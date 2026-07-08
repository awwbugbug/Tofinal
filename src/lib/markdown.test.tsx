import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderMarkdown } from "@/lib/markdown";

const renderNote = (text: string) => render(<div data-testid="md">{renderMarkdown(text)}</div>);

describe("markdown renderer", () => {
  it("renders headings, paragraphs, and hard line breaks", () => {
    renderNote("# Title\n## Sub\nline one\nline two");

    expect(screen.getByRole("heading", { level: 3, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Sub" })).toBeInTheDocument();
    const paragraph = screen.getByTestId("md").querySelector(".nm-p");
    expect(paragraph?.textContent).toBe("line oneline two");
    expect(paragraph?.querySelector("br")).toBeInTheDocument();
  });

  it("renders bold, italic, and inline code", () => {
    renderNote("mix **bold** and *italic* and `code`");

    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code")).toHaveClass("nm-code");
  });

  it("renders lists and read-only checklists", () => {
    renderNote("- plain item\n- [ ] open item\n- [x] done item\n\n1. first\n2. second");

    expect(screen.getByText("plain item").closest("ul")).toBeInTheDocument();
    expect(screen.getByText("first").closest("ol")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[1]).toBeDisabled();
    expect(screen.getByText("done item")).toHaveClass("nm-check-done");
  });

  it("renders fenced code blocks and quotes", () => {
    renderNote("```\nconst a = 1;\n```\n> quoted line");

    expect(screen.getByText("const a = 1;").closest("pre")).toHaveClass("nm-pre");
    expect(screen.getByText("quoted line").closest("blockquote")).toHaveClass("nm-quote");
  });

  it("renders http links with the correct href", () => {
    renderNote("see [the docs](https://example.com/x)");

    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("href", "https://example.com/x");
  });

  it("treats raw HTML as literal text, never markup", () => {
    renderNote("<script>alert(1)</script> and <img src=x onerror=alert(1)>");

    expect(screen.getByTestId("md").querySelector("script")).toBeNull();
    expect(screen.getByTestId("md").querySelector("img")).toBeNull();
    expect(screen.getByTestId("md").textContent).toContain("<script>alert(1)</script>");
  });

  it("degrades unsupported syntax to plain text without crashing", () => {
    renderNote("| a | b |\n|---|---|\n![img](https://example.com/i.png)");

    expect(screen.getByTestId("md").textContent).toContain("| a | b |");
  });
});
