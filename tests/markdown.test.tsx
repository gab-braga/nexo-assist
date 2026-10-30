import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "../src/components/conversation/markdown-renderer";
import { markdownSample, streamingParts } from "./fixtures/markdown";

test("Markdown renders semantic headings, emphasis, lists, quotes, GFM tables and code", () => {
  const html = renderToStaticMarkup(
    <MarkdownRenderer content={markdownSample} />,
  );
  for (const tag of [
    "h1",
    "h2",
    "h3",
    "p",
    "strong",
    "em",
    "ul",
    "ol",
    "blockquote",
    "table",
    "thead",
    "tbody",
    "pre",
    "code",
    "del",
  ])
    assert.ok(html.includes(`<${tag}`), tag);
  assert.match(html, /text-right/);
  assert.match(html, /type="checkbox" disabled=""/);
  assert.match(html, /Esta linha deve permanecer separada/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("raw HTML, unsafe protocols, attributes and remote images cannot execute or load", () => {
  const html = renderToStaticMarkup(
    <MarkdownRenderer
      content={
        markdownSample +
        '\n<iframe src="https://example.com"></iframe>\n\n<img src=x onerror=alert(1)>\n\n[Dados](data:text/html,malicious)'
      }
    />,
  );
  for (const forbidden of [
    "<script",
    "<iframe",
    "<img",
    "javascript:",
    "data:text/html",
    "onerror=",
    "window.markdownExecuted",
  ])
    assert.ok(!html.includes(forbidden), forbidden);
  assert.ok(html.includes("Link inseguro"));
});

test("partial Markdown is renderable at every streaming boundary without repairing original text", () => {
  const original = streamingParts.join("");
  for (let index = 1; index <= original.length; index++)
    assert.doesNotThrow(() =>
      renderToStaticMarkup(
        <MarkdownRenderer content={original.slice(0, index)} />,
      ),
    );
  const openFence = renderToStaticMarkup(
    <MarkdownRenderer content={streamingParts.slice(0, 2).join("")} />,
  );
  assert.ok(openFence.includes("<pre"));
  assert.ok(openFence.includes("Ainda recebendo"));
  assert.equal(streamingParts.join(""), original);
});
