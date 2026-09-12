"use client";

import ReactMarkdown from "react-markdown";

export function AnswerView({ markdown, streaming }: { markdown: string; streaming: boolean }) {
  if (!markdown && streaming) {
    return <p className="text-ink-2">思考中…</p>;
  }
  return (
    <div className={`answer ${streaming ? "streaming" : ""}`}>
      <ReactMarkdown
        components={{
          h2: ({ children }) => <h2>{children}</h2>,
          ul: ({ children }) => <ul>{children}</ul>,
          li: ({ children }) => (
            <li>
              <span className="mark">{children}</span>
            </li>
          ),
          p: ({ children }) => <p>{children}</p>,
        }}
      >
        {markdown}
      </ReactMarkdown>
      {streaming && <span className="cursor" aria-hidden />}
    </div>
  );
}
