"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const remarkPlugins = [remarkGfm];
const components: Components = {
  a: ({ href, children }) => {
    // Keep react-markdown's default URL sanitization. Rejected URLs are text.
    if (!href) return <span>{children}</span>;
    const external = /^(?:https?:)?\/\//i.test(href);
    return (
      <a href={href} target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-primary underline underline-offset-2 wrap-anywhere focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
        {children}
      </a>
    );
  },
  // Do not fetch model-supplied images or send a user's address to third parties.
  img: ({ alt }) => <span className="text-muted-foreground">{alt}</span>,
  table: ({ children }) => (
    <div role="region" aria-label="Tabela da resposta" tabIndex={0}
      className="my-3 max-w-full overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full border-collapse text-left text-[0.9em]">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th className={cn("border-b border-border bg-muted px-3 py-2 font-semibold", {
      "text-right": style?.textAlign === "right", "text-center": style?.textAlign === "center",
    })}>{children}</th>
  ),
  td: ({ children, style }) => (
    <td className={cn("border-b border-border px-3 py-2 align-top", {
      "text-right": style?.textAlign === "right", "text-center": style?.textAlign === "center",
    })}>{children}</td>
  ),
};

/** Render the original text only; never repair/rewrite incomplete streaming syntax. */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div data-visual="agent-markdown"
      className="min-w-0 max-w-full whitespace-normal wrap-anywhere leading-relaxed text-inherit
        [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold
        [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold
        [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold
        [&_h4]:mb-2 [&_h4]:mt-3 [&_h4]:font-semibold
        [&_h5]:mb-2 [&_h5]:mt-3 [&_h5]:font-semibold
        [&_h6]:mb-2 [&_h6]:mt-3 [&_h6]:font-semibold
        [&_p]:my-2 [&_p]:whitespace-pre-wrap [&_strong]:font-semibold [&_em]:italic
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:my-1 [&_li>p]:my-1 [&_li>ul]:my-1 [&_li>ol]:my-1
        [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
        [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]
        [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:whitespace-pre [&_pre]:wrap-normal
        [&_pre_code]:rounded-none [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_hr]:my-4 [&_hr]:border-border [&_del]:line-through [&_input]:mr-2 [&_input]:accent-primary
        [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
});
