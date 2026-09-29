"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Wide tables scroll inside their own box instead of squeezing words apart or pushing the page sideways.
const MD: Components = {
  table: ({ node, ...props }) => <div className="tablewrap" tabIndex={0} role="region" aria-label="Table"><table {...props} /></div>,
};
const PLUGINS = [remarkGfm];

// Memoized on the text: typing in the idea box re-renders the page, but an answer is only re-parsed when it changes.
export default memo(function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={PLUGINS} components={MD}>{text}</ReactMarkdown>;
});
