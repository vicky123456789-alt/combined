'use client';

import { X, Wand2, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Props {
  open: boolean;
  onClose: () => void;
  content: string;      // markdown streamed in
  isStreaming: boolean;
}

export default function AiReviewPanel({ open, onClose, content, isStreaming }: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
      />
      
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '450px',
          background: 'var(--surface-50)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.4rem', background: 'rgba(167,139,250,0.1)', borderRadius: '0.5rem', border: '1px solid rgba(167,139,250,0.2)' }}>
              <Wand2 size={16} color="#a78bfa" />
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'white', margin: 0 }}>AI Code Review</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>Big-O analysis & optimisations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--surface-400)',
              padding: '0.5rem',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'white'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--surface-400)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
          }}
        >
          {isStreaming && content === '' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Analysing your code…
            </div>
          )}

          {content && (
            <div className="ai-review-content">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Streaming cursor */}
        {isStreaming && content && (
          <div style={{ padding: '0 1.25rem 1rem', flexShrink: 0 }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '16px',
                background: '#a78bfa',
                borderRadius: '2px',
                animation: 'blink 1s step-end infinite',
              }}
            />
          </div>
        )}

        <style>{`
          @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
          .ai-review-content { font-size: 0.85rem; line-height: 1.7; color: var(--text-primary); }
          .ai-review-content h1,.ai-review-content h2,.ai-review-content h3 {
            font-weight: 700; margin: 1rem 0 0.5rem; color: white;
          }
          .ai-review-content h1 { font-size: 1rem; }
          .ai-review-content h2 { font-size: 0.95rem; color: #a78bfa; }
          .ai-review-content h3 { font-size: 0.85rem; color: var(--brand-400); }
          .ai-review-content p { margin: 0.5rem 0; color: var(--text-muted); }
          .ai-review-content strong { color: white; font-weight: 600; }
          .ai-review-content code {
            background: var(--surface-200); border-radius: 4px;
            padding: 1px 6px; font-family: var(--font-geist-mono);
            font-size: 0.8rem; color: #93c5fd;
          }
          .ai-review-content pre {
            background: var(--editor-bg); border: 1px solid var(--border);
            border-radius: 0.5rem; padding: 0.875rem 1rem; overflow-x: auto;
            margin: 0.75rem 0;
          }
          .ai-review-content pre code {
            background: transparent; padding: 0; font-size: 0.8rem; color: #e2e8f0;
          }
          .ai-review-content ul { padding-left: 1.25rem; margin: 0.5rem 0; }
          .ai-review-content li { margin: 0.25rem 0; color: var(--text-muted); }
        `}</style>
      </div>
    </>
  );
}
