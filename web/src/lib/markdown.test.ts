// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders common Markdown to HTML", () => {
    const html = renderMarkdown("**bold** and *italic*\n\n- one\n- two");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("renders headings and inline code", () => {
    const html = renderMarkdown("### Heads up\nwatch your `caffeine`");
    expect(html).toContain("<h3>Heads up</h3>");
    expect(html).toContain("<code>caffeine</code>");
  });

  it("strips unsafe HTML (scripts, event handlers)", () => {
    const html = renderMarkdown("hi <script>alert(1)</script> <img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});
