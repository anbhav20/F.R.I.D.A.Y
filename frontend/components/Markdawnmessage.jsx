import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition text-slate-300"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
};

// react-markdown v9: NO className prop on <ReactMarkdown>
// Style via components prop only
export const MarkdownMessage = ({ content }) => (
  <div style={{ fontSize: "0.875rem", lineHeight: "1.6", color: "#cbd5e1" }}>
    <ReactMarkdown
      components={{
        // Paragraphs
        p: ({ children }) => (
          <p style={{ margin: "4px 0" }}>{children}</p>
        ),

        // Headings
        h1: ({ children }) => (
          <h1 style={{ color: "#f1f5f9", fontWeight: 600, fontSize: "1.2rem", margin: "12px 0 6px" }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ color: "#f1f5f9", fontWeight: 600, fontSize: "1.05rem", margin: "10px 0 5px" }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem", margin: "8px 0 4px" }}>{children}</h3>
        ),

        // Bold & italic
        strong: ({ children }) => (
          <strong style={{ color: "#f1f5f9", fontWeight: 600 }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em style={{ color: "#94a3b8" }}>{children}</em>
        ),

        // Lists
        ul: ({ children }) => (
          <ul style={{ margin: "4px 0", paddingLeft: "1.25rem", listStyleType: "disc" }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ margin: "4px 0", paddingLeft: "1.25rem", listStyleType: "decimal" }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ margin: "2px 0" }}>{children}</li>
        ),

        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#38bdf8", textDecoration: "none" }}
            onMouseEnter={(e) => (e.target.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.target.style.textDecoration = "none")}
          >
            {children}
          </a>
        ),

        // Inline & block code
        code: ({ inline, className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || "");
          const codeText = String(children).replace(/\n$/, "");

          // Block code with syntax highlighting
          if (!inline && match) {
            return (
              <div style={{ position: "relative", margin: "10px 0" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#1a1f2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px 8px 0 0",
                    padding: "6px 14px",
                  }}
                >
                  <span style={{ fontSize: "0.7rem", color: "#64748b", fontFamily: "monospace" }}>
                    {match[1]}
                  </span>
                  <CopyButton text={codeText} />
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: "0 0 8px 8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderTop: "none",
                    fontSize: "0.78rem",
                  }}
                  {...props}
                >
                  {codeText}
                </SyntaxHighlighter>
              </div>
            );
          }

          // Block code without language tag
          if (!inline) {
            return (
              <div style={{ position: "relative", margin: "10px 0" }}>
                <CopyButton text={codeText} />
                <pre
                  style={{
                    background: "#1a1f2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    fontSize: "0.78rem",
                    overflowX: "auto",
                    color: "#e2e8f0",
                    fontFamily: "monospace",
                  }}
                >
                  <code>{codeText}</code>
                </pre>
              </div>
            );
          }

          // Inline code
          return (
            <code
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#67e8f9",
                padding: "1px 6px",
                borderRadius: "4px",
                fontSize: "0.8rem",
                fontFamily: "monospace",
              }}
            >
              {children}
            </code>
          );
        },

        // Blockquote
        blockquote: ({ children }) => (
          <blockquote
            style={{
              borderLeft: "3px solid rgba(139,92,246,0.5)",
              margin: "8px 0",
              paddingLeft: "12px",
              color: "#94a3b8",
            }}
          >
            {children}
          </blockquote>
        ),

        // Table
        table: ({ children }) => (
          <div style={{ overflowX: "auto", margin: "10px 0" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              background: "rgba(255,255,255,0.08)",
              padding: "8px 12px",
              textAlign: "left",
              color: "#e2e8f0",
              fontWeight: 600,
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            style={{
              padding: "7px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              color: "#cbd5e1",
            }}
          >
            {children}
          </td>
        ),

        // Horizontal rule
        hr: () => (
          <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", margin: "12px 0" }} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);