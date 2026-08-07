'use client';

import { FlaskConical, Plus, Trash2, CheckCircle2, XCircle, Loader2, Info, Play } from 'lucide-react';
import { TestCase } from '@/lib/types';

export interface TestCasesPanelProps {
  testCases: TestCase[];
  onAddTestCase: () => void;
  onUpdateTestCase: (id: string, updates: Partial<TestCase>) => void;
  onRemoveTestCase: (id: string) => void;
  onRun: () => void;
  isRunning: boolean;
}

export default function TestCasesPanel({
  testCases,
  onAddTestCase,
  onUpdateTestCase,
  onRemoveTestCase,
  onRun,
  isRunning,
}: TestCasesPanelProps) {

  const statusBadge = (status?: TestCase['status']) => {
    switch (status) {
      case 'AC':
        return <span style={{ color: 'var(--color-ac)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}><CheckCircle2 size={12} /> AC</span>;
      case 'WA':
        return <span style={{ color: 'var(--color-wa)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}><XCircle size={12} /> WA</span>;
      case 'ERROR':
        return <span style={{ color: 'var(--color-wa)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}><XCircle size={12} /> ERR</span>;
      case 'RUNNING':
        return <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Running...</span>;
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-50)',
        borderTop: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', fontWeight: 600 }}>
          <FlaskConical size={14} color="var(--brand-400)" />
          Test Cases
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={onAddTestCase}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* Test Cases List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {testCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <Info size={24} style={{ opacity: 0.5, margin: '0 auto 0.5rem' }} />
            <p>No test cases yet.</p>
            <p>Add a manual test case or use the AI generator.</p>
          </div>
        ) : (
          testCases.map((tc, idx) => (
            <div key={tc.id} style={{ flexShrink: 0, background: 'var(--surface-100)', border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--surface-200)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white' }}>Test {idx + 1}</span>
                  {statusBadge(tc.status)}
                  {tc.time && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tc.time}ms</span>}
                </div>
                <button
                  onClick={() => onRemoveTestCase(tc.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--surface-400)', padding: '0.2rem', lineHeight: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-wa)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--surface-400)'; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              
              <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Input</div>
                  <textarea
                    value={tc.input}
                    onChange={(e) => onUpdateTestCase(tc.id, { input: e.target.value })}
                    style={{
                      width: '100%',
                      minHeight: '60px',
                      background: 'var(--editor-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.25rem',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-geist-mono)',
                      fontSize: '0.8rem',
                      padding: '0.5rem',
                      resize: 'vertical',
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Expected Output</div>
                  <textarea
                    value={tc.expected}
                    onChange={(e) => onUpdateTestCase(tc.id, { expected: e.target.value })}
                    style={{
                      width: '100%',
                      minHeight: '40px',
                      background: 'var(--editor-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.25rem',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-geist-mono)',
                      fontSize: '0.8rem',
                      padding: '0.5rem',
                      resize: 'vertical',
                    }}
                  />
                </div>
                
                {/* Actual output (if run) */}
                {tc.output !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: tc.status === 'AC' ? 'var(--color-ac)' : 'var(--color-wa)', marginBottom: '0.25rem' }}>Actual Output</div>
                    <pre
                      style={{
                        margin: 0,
                        width: '100%',
                        background: 'rgba(0,0,0,0.2)',
                        border: `1px solid ${tc.status === 'AC' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: '0.25rem',
                        color: tc.status === 'AC' ? 'var(--color-ac)' : 'var(--color-wa)',
                        fontFamily: 'var(--font-geist-mono)',
                        fontSize: '0.8rem',
                        padding: '0.5rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {tc.output || '(empty)'}
                    </pre>
                  </div>
                )}
                
                {/* Error (if any) */}
                {tc.error && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-wa)', marginBottom: '0.25rem' }}>Error</div>
                    <pre
                      style={{
                        margin: 0,
                        width: '100%',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '0.25rem',
                        color: 'var(--color-wa)',
                        fontFamily: 'var(--font-geist-mono)',
                        fontSize: '0.8rem',
                        padding: '0.5rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {tc.error}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Run Action Area */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', background: 'var(--surface-50)' }}>
        <button
          onClick={onRun}
          disabled={isRunning || testCases.length === 0}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.625rem',
            background: isRunning || testCases.length === 0 ? 'var(--surface-200)' : 'linear-gradient(135deg, var(--brand-600), var(--brand-500))',
            border: 'none',
            borderRadius: '0.5rem',
            color: isRunning || testCases.length === 0 ? 'var(--text-muted)' : 'white',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isRunning || testCases.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: isRunning || testCases.length === 0 ? 'none' : '0 0 16px rgba(98,116,245,0.35)',
            transition: 'all 0.2s',
          }}
        >
          {isRunning ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          {isRunning ? 'Running...' : 'Run All Tests'}
        </button>
      </div>
    </div>
  );
}
