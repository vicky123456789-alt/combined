/**
 * Shared type definitions used across Dashboard and Workspace pages.
 * Exported here so Phase 3/4 components can import without circular deps.
 */

export type Language = 'cpp-g++-15' | 'python-3.14' | 'deno';

export interface RunRecord {
  id: string;
  title: string;
  language: Language;
  languageLabel: string;
  date: string;       // ISO string
  status: 'AC' | 'WA' | 'ERROR' | 'PENDING';
  passedTests: number;
  totalTests: number;
}

export interface TestCase {
  id: string;
  input: string;
  expected: string;
  output?: string;
  error?: string;
  exitCode?: number;
  time?: string;
  status?: 'AC' | 'WA' | 'ERROR' | 'RUNNING' | 'IDLE';
}

export const STORAGE_KEY_HISTORY = 'cp_run_history';
export const STORAGE_KEY_SAVE_RUNS = 'cp_save_runs';

export const LANGUAGE_META: Record<Language, { label: string; ext: string; color: string; bg: string; monacoLang: string }> = {
  'cpp-g++-15':  { label: 'C++',    ext: 'cpp', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  monacoLang: 'cpp'        },
  'python-3.14': { label: 'Python', ext: 'py',  color: '#facc15', bg: 'rgba(250,204,21,0.12)',  monacoLang: 'python'     },
  deno:          { label: 'JS',     ext: 'js',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  monacoLang: 'javascript' },
};
