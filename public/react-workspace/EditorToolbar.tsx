'use client';

import { Language, LANGUAGE_META } from '@/lib/types';
import LanguageSelector from './LanguageSelector';
import {
  Download,
  Save,
  ToggleLeft,
  ToggleRight,
  Wand2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  saveHistory: boolean;
  onSaveHistoryToggle: () => void;
  onDownload: () => void;
  onAiReview: () => void;
  onRun: () => void;
  isRunning: boolean;
  isSaving?: boolean;
}

export default function EditorToolbar({
  language,
  onLanguageChange,
  saveHistory,
  onSaveHistoryToggle,
  onDownload,
  onAiReview,
  onRun,
  isRunning,
  isSaving,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.875rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-100)',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      {/* Language picker */}
      <LanguageSelector value={language} onChange={onLanguageChange} />

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 0.25rem' }} />

      {/* Save History toggle */}
      <button
        id="btn-toggle-save-history"
        onClick={onSaveHistoryToggle}
        title={saveHistory ? 'Save Run History: ON' : 'Save Run History: OFF'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.35rem 0.625rem',
          background: saveHistory ? 'rgba(98,116,245,0.15)' : 'var(--surface-200)',
          border: `1px solid ${saveHistory ? 'rgba(98,116,245,0.4)' : 'var(--border)'}`,
          borderRadius: '0.5rem',
          cursor: 'pointer',
          color: saveHistory ? 'var(--brand-400)' : 'var(--text-muted)',
          fontSize: '0.75rem',
          fontWeight: 500,
          transition: 'all 0.2s',
          whiteSpace: 'nowrap',
        }}
      >
        {saveHistory
          ? <ToggleRight size={14} />
          : <ToggleLeft size={14} />
        }
        <Save size={11} />
        History
      </button>

      {/* Download Code */}
      <button
        id="btn-download-code"
        onClick={onDownload}
        title={`Download as .${LANGUAGE_META[language].ext}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.35rem 0.625rem',
          background: 'var(--surface-200)',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
          fontWeight: 500,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--surface-400)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
      >
        <Download size={12} />
        .{LANGUAGE_META[language].ext}
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 0.25rem' }} />

      {/* AI Review */}
      <button
        id="btn-ai-review"
        onClick={onAiReview}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.35rem 0.75rem',
          background: 'rgba(167,139,250,0.1)',
          border: '1px solid rgba(167,139,250,0.25)',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          color: '#a78bfa',
          fontSize: '0.75rem',
          fontWeight: 500,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.2)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.1)'; }}
      >
        <Wand2 size={12} />
        AI Review
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Run button */}
      <button
        id="btn-run-code"
        onClick={onRun}
        disabled={isRunning}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 1rem',
          background: isRunning
            ? 'rgba(98,116,245,0.3)'
            : 'linear-gradient(135deg, var(--brand-600), var(--brand-500))',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: isRunning ? 'not-allowed' : 'pointer',
          color: 'white',
          fontSize: '0.825rem',
          fontWeight: 600,
          transition: 'all 0.2s',
          boxShadow: isRunning ? 'none' : '0 0 16px rgba(98,116,245,0.35)',
          whiteSpace: 'nowrap',
        }}
      >
        <RefreshCw
          size={13}
          style={{
            animation: isRunning ? 'spin 0.8s linear infinite' : 'none',
          }}
        />
        {isRunning ? 'Running…' : 'Run All Tests'}
      </button>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
