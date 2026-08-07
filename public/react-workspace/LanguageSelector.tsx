'use client';

import { Language, LANGUAGE_META } from '@/lib/types';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

const LANGUAGES = Object.entries(LANGUAGE_META) as [Language, typeof LANGUAGE_META[Language]][];

export default function LanguageSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGE_META[value];

  /* Close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id="btn-language-selector"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.75rem',
          background: 'var(--surface-200)',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          color: 'white',
          fontSize: '0.8rem',
          fontWeight: 600,
          fontFamily: 'var(--font-geist-mono)',
          transition: 'border-color 0.15s, background 0.15s',
          minWidth: '100px',
        }}
      >
        {/* Colour dot */}
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: current.color,
            flexShrink: 0,
            boxShadow: `0 0 6px ${current.color}80`,
          }}
        />
        {current.label}
        <ChevronDown
          size={12}
          style={{
            marginLeft: 'auto',
            color: 'var(--text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100,
            background: 'var(--surface-100)',
            border: '1px solid var(--border)',
            borderRadius: '0.625rem',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: '160px',
          }}
        >
          {LANGUAGES.map(([lang, meta]) => (
            <button
              key={lang}
              id={`btn-lang-${lang}`}
              onClick={() => { onChange(lang); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                width: '100%',
                padding: '0.6rem 1rem',
                background: lang === value ? 'var(--surface-200)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: lang === value ? 'white' : 'var(--text-muted)',
                fontSize: '0.825rem',
                fontFamily: 'var(--font-geist-mono)',
                fontWeight: lang === value ? 600 : 400,
                textAlign: 'left',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { if (lang !== value) { e.currentTarget.style.background = 'var(--surface-200)'; e.currentTarget.style.color = 'white'; } }}
              onMouseLeave={e => { if (lang !== value) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: meta.color,
                  flexShrink: 0,
                  boxShadow: lang === value ? `0 0 6px ${meta.color}80` : 'none',
                }}
              />
              <span style={{ flex: 1 }}>{meta.label}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--surface-500)' }}>.{meta.ext}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
