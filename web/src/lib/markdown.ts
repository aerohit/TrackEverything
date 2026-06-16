/**
 * Render LLM answers (Markdown) to sanitized HTML for the Ask LLM screen (ADR-023).
 * `marked` parses Markdown; `DOMPurify` strips anything unsafe (the text passes
 * through the model, so we never trust raw HTML in it).
 */
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  const html = marked.parse(md ?? "", { async: false }) as string;
  return DOMPurify.sanitize(html);
}
