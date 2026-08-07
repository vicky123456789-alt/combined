'use client';

import { useRef, useCallback } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { Language, LANGUAGE_META } from '@/lib/types';

/* ─── Default starter snippets per language ───────────────── */
const STARTERS: Record<Language, string> = {
  'cpp-g++-15': `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    // TODO: read input, solve, output
    
    return 0;
}
`,
  'python-3.14': `import sys
input = sys.stdin.readline

def solve():
    # TODO: read input, solve, output
    pass

# Single test case
solve()

# Multiple test cases:
# t = int(input())
# for _ in range(t):
#     solve()
`,
  deno: `// Competitive Programming — JavaScript (Deno)
const lines = (await Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .getReader()
  .read()).value?.split('\\n') ?? [];

let idx = 0;
const readLine = () => lines[idx++]?.trim() ?? '';
const readInt = () => parseInt(readLine());
const readInts = () => readLine().split(' ').map(Number);

// TODO: solve
`,
};

interface Props {
  language: Language;
  value: string;
  onChange: (code: string) => void;
  editorRef: React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
}

export default function CodeEditor({ language, value, onChange, editorRef }: Props) {
  const meta = LANGUAGE_META[language];

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    // Configure editor settings
    editor.updateOptions({
      fontSize: 14,
      fontFamily: '"Geist Mono", "Cascadia Code", "Fira Code", monospace',
      fontLigatures: true,
      lineHeight: 22,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'off',
      padding: { top: 16, bottom: 16 },
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: { showSnippets: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      formatOnPaste: false,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      scrollbar: {
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
    });
  }, [editorRef]);

  return (
    <div style={{ flex: 1, overflow: 'hidden', background: 'var(--editor-bg)', position: 'relative' }}>
      {/* Language watermark */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '1.5rem',
          right: '1.5rem',
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.06)',
          fontFamily: 'var(--font-geist-mono)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          userSelect: 'none',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {meta.label.toUpperCase()}
      </div>

      <MonacoEditor
        height="100%"
        language={meta.monacoLang}
        defaultValue={value || STARTERS[language]}
        theme="vs-dark"
        onChange={v => {
          if (onChange) onChange(v ?? '');
        }}
        onMount={handleMount}
        loading={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              gap: '0.5rem',
            }}
          >
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
            Loading editor…
          </div>
        }
        options={{
          readOnly: false,
          contextmenu: true,
        }}
      />
    </div>
  );
}
