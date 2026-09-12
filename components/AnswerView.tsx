"use client";

import ReactMarkdown from "react-markdown";

export function AnswerView({ markdown, streaming }: { markdown: string; streaming: boolean }) {
  if (!markdown && streaming) {
    return <p className="text-zinc-400 text-xl animate-pulse">思考中…</p>;
  }
  return (
    <div className="answer">
      <ReactMarkdown
        components={{
          h2: ({ children }) => <h2>{children}</h2>,
          ul: ({ children }) => <ul>{children}</ul>,
          li: ({ children }) => <li>{children}</li>,
          p: ({ children }) => <p>{children}</p>,
        }}
      >
        {markdown}
      </ReactMarkdown>
      {streaming && <span className="cursor" aria-hidden />}
    </div>
  );
}
