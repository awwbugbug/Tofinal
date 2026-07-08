import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown renderer for task notes.
 *
 * Deliberately outputs React elements only — never HTML strings — so raw
 * HTML in a note is displayed as literal text and script injection is
 * structurally impossible (important in a Tauri webview that holds IPC
 * access). Unsupported syntax degrades to plain text.
 *
 * Supported: # ## ### headings, **bold**, *italic*, `code`, ``` fences,
 * - / 1. lists, - [ ] checklists (read-only), > quotes, [text](https://url)
 * links (opened externally), --- rules, hard line breaks inside paragraphs.
 */

const openExternal = (url: string) => {
  import("@tauri-apps/plugin-opener")
    .then(({ openUrl }) => openUrl(url))
    .catch(() => {
      window.open?.(url, "_blank", "noopener,noreferrer");
    });
};

type InlineParser = (text: string, keyPrefix: string) => ReactNode[];

type InlinePattern = {
  regex: RegExp;
  render: (match: RegExpMatchArray, key: string, parse: InlineParser) => ReactNode;
};

const INLINE_PATTERNS: InlinePattern[] = [
  {
    regex: /`([^`]+)`/,
    render: (match, key) => (
      <code className="nm-code" key={key}>
        {match[1]}
      </code>
    ),
  },
  {
    regex: /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/,
    render: (match, key, parse) => (
      <a
        className="nm-link"
        href={match[2]}
        key={key}
        onClick={(event) => {
          event.preventDefault();
          openExternal(match[2]);
        }}
        rel="noopener noreferrer"
      >
        {parse(match[1], `${key}-t`)}
      </a>
    ),
  },
  {
    regex: /\*\*([^*]+)\*\*/,
    render: (match, key, parse) => <strong key={key}>{parse(match[1], `${key}-b`)}</strong>,
  },
  {
    regex: /\*([^*]+)\*/,
    render: (match, key, parse) => <em key={key}>{parse(match[1], `${key}-i`)}</em>,
  },
];

const parseInline: InlineParser = (text, keyPrefix) => {
  if (!text) {
    return [];
  }

  let earliest: { index: number; pattern: InlinePattern; match: RegExpMatchArray } | null = null;
  for (const pattern of INLINE_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match?.index !== undefined && (earliest === null || match.index < earliest.index)) {
      earliest = { index: match.index, pattern, match };
    }
  }

  if (!earliest) {
    return [text];
  }

  const { index, pattern, match } = earliest;
  const before = text.slice(0, index);
  const after = text.slice(index + match[0].length);
  return [
    ...(before ? [before] : []),
    pattern.render(match, `${keyPrefix}-${index}`, parseInline),
    ...parseInline(after, `${keyPrefix}-a`),
  ];
};

const CHECKBOX_ITEM = /^\[( |x|X)\]\s+(.*)$/;
const UNORDERED_ITEM = /^\s*[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const HORIZONTAL_RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_LINE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

const renderListItem = (content: string, key: string) => {
  const checkboxMatch = content.match(CHECKBOX_ITEM);
  if (checkboxMatch) {
    const checked = checkboxMatch[1].toLowerCase() === "x";
    return (
      <li className="nm-check" key={key}>
        <input checked={checked} disabled readOnly type="checkbox" />
        <span className={checked ? "nm-check-done" : undefined}>{parseInline(checkboxMatch[2], key)}</span>
      </li>
    );
  }

  return <li key={key}>{parseInline(content, key)}</li>;
};

export const renderMarkdown = (text: string): ReactNode => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence (or end of text)
      blocks.push(
        <pre className="nm-pre" key={`b${blocks.length}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const HeadingTag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      blocks.push(
        <HeadingTag className={`nm-h${level}`} key={`b${blocks.length}`}>
          {parseInline(headingMatch[2], `h${blocks.length}`)}
        </HeadingTag>,
      );
      index += 1;
      continue;
    }

    if (HORIZONTAL_RULE.test(line) && !UNORDERED_ITEM.test(line)) {
      blocks.push(<hr className="nm-hr" key={`b${blocks.length}`} />);
      index += 1;
      continue;
    }

    if (QUOTE_LINE.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && QUOTE_LINE.test(lines[index])) {
        quoteLines.push(lines[index].match(QUOTE_LINE)?.[1] ?? "");
        index += 1;
      }
      blocks.push(
        <blockquote className="nm-quote" key={`b${blocks.length}`}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <Fragment key={quoteIndex}>
              {quoteIndex > 0 && <br />}
              {parseInline(quoteLine, `q${blocks.length}-${quoteIndex}`)}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line)) {
      const ordered = ORDERED_ITEM.test(line) && !UNORDERED_ITEM.test(line);
      const itemRegex = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
      const items: ReactNode[] = [];
      while (index < lines.length && itemRegex.test(lines[index])) {
        const content = lines[index].match(itemRegex)?.[1] ?? "";
        items.push(renderListItem(content, `l${blocks.length}-${items.length}`));
        index += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag className={ordered ? "nm-ol" : "nm-ul"} key={`b${blocks.length}`}>
          {items}
        </ListTag>,
      );
      continue;
    }

    // Paragraph: consecutive plain lines, single newlines become hard breaks.
    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !QUOTE_LINE.test(lines[index]) &&
      !UNORDERED_ITEM.test(lines[index]) &&
      !ORDERED_ITEM.test(lines[index]) &&
      !HORIZONTAL_RULE.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p className="nm-p" key={`b${blocks.length}`}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {parseInline(paragraphLine, `p${blocks.length}-${lineIndex}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
};
