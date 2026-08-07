'use client';

import { Sparkles, Loader2, BookOpen } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export interface LeftPanelProps {
  onGenerateTests: (problemText: string) => Promise<void>;
  isGenerating: boolean;
  autoRunOnGenerate: boolean;
  onToggleAutoRun: () => void;
  problemSummary: string;
}

export default function LeftPanel({
  onGenerateTests,
  isGenerating,
  autoRunOnGenerate,
  onToggleAutoRun,
  problemSummary,
}: LeftPanelProps) {
  const [problemText, setProblemText] = useState('');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-50)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', fontWeight: 600 }}>
          <BookOpen size={14} color="var(--brand-400)" />
          Problem Info
        </div>
      </div>

      {/* AI Generate Section */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-100)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          AI Test Generator
        </div>
        <div style={{ position: 'relative', width: '100%' }}>
          <textarea
            placeholder="Paste problem statement text here..."
            value={problemText}
            onChange={(e) => setProblemText(e.target.value)}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '0.5rem',
              fontSize: '0.75rem',
              background: 'var(--surface-200)',
              border: '1px solid var(--border)',
              borderRadius: '0.375rem',
              color: 'white',
              resize: 'vertical',
            }}
          />
        </div>
        <button
          onClick={() => onGenerateTests(problemText)}
          disabled={isGenerating || !problemText.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            padding: '0.5rem 0.75rem',
            background: isGenerating || !problemText.trim() ? 'var(--surface-200)' : 'rgba(167,139,250,0.15)',
            border: `1px solid ${isGenerating || !problemText.trim() ? 'var(--border)' : 'rgba(167,139,250,0.3)'}`,
            borderRadius: '0.375rem',
            color: isGenerating || !problemText.trim() ? 'var(--text-muted)' : '#a78bfa',
            fontSize: '0.75rem',
            fontWeight: 500,
            cursor: isGenerating || !problemText.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            width: '100%',
          }}
        >
          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Generate Summary & Tests
        </button>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoRunOnGenerate}
            onChange={onToggleAutoRun}
            style={{ accentColor: 'var(--brand-500)' }}
          />
          Auto-run code after generating tests
        </label>
      </div>

      {/* Problem Summary Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: 'var(--surface-50)' }}>
        {problemSummary ? (
          <div className="prose prose-invert prose-sm" style={{ maxWidth: 'none' }}>
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {problemSummary}
            </ReactMarkdown>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <BookOpen size={24} style={{ opacity: 0.5, margin: '0 auto 0.5rem' }} />
            <p>No problem summary available.</p>
            <p>Paste the problem statement and click Generate.</p>
          </div>
        )}
      </div>
    </div>
  );
}
