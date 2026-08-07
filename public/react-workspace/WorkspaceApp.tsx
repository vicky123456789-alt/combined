import React, { useRef, useState, useCallback, useEffect } from 'react';
import type * as Monaco from 'monaco-editor';
import { ArrowLeft, Code2 } from 'lucide-react';

import { Language, LANGUAGE_META, TestCase } from './lib/types';
// We'll skip local storage imports for simplicity, assuming default true
import SplitPane from './SplitPane';
import LeftPanel from './LeftPanel';
import TestCasesPanel from './TestCasesPanel';
import CodeEditor from './CodeEditor';
import EditorToolbar from './EditorToolbar';
import AiReviewPanel from './AiReviewPanel';

const STARTERS: Record<Language, string> = {
  'cpp-g++-15': `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    // TODO: read input, solve, output\n    \n    return 0;\n}\n`,
  'python-3.14': `import sys\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nsolve()\n`,
  deno: `const lines = (await Deno.stdin.readable\n  .pipeThrough(new TextDecoderStream())\n  .getReader()\n  .read()).value?.split('\\n') ?? [];\nlet idx = 0;\nconst readLine = () => lines[idx++]?.trim() ?? '';\n`,
};

export default function WorkspaceApp() {
  const workspaceId = "local-session";

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [language, setLanguage] = useState<Language>('cpp-g++-15');
  const [code, setCode] = useState<string>(STARTERS['cpp-g++-15']);
  const [saveHistory, setSaveHistory] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoRunOnGenerate, setAutoRunOnGenerate] = useState(true);
  const [shouldAutoRun, setShouldAutoRun] = useState(false);
  const [problemSummary, setProblemSummary] = useState('');

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewContent, setReviewContent] = useState('');
  const [isReviewStreaming, setIsReviewStreaming] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLanguageChange = useCallback((lang: Language) => {
    const currentCode = editorRef.current?.getValue() ?? code;
    const isStillDefault = Object.values(STARTERS).some(s => s.trim() === currentCode.trim());
    if (isStillDefault) {
      editorRef.current?.setValue(STARTERS[lang]);
      setCode(STARTERS[lang]);
    }
    setLanguage(lang);
  }, [code]);

  const handleAddTestCase = useCallback(() => {
    setTestCases(prev => [...prev, { id: crypto.randomUUID(), input: '', expected: '' }]);
  }, []);

  const handleUpdateTestCase = useCallback((id: string, updates: Partial<TestCase>) => {
    setTestCases(prev => prev.map(tc => tc.id === id ? { ...tc, ...updates } : tc));
  }, []);

  const handleRemoveTestCase = useCallback((id: string) => {
    setTestCases(prev => prev.filter(tc => tc.id !== id));
  }, []);

  const handleGenerateTests = useCallback(async (problemText: string) => {
    // We can wire this to the CF backend or just set a stub for now
    alert('AI Test Generation requires backend connection. Paste problem URL in CF Tracker instead.');
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning || testCases.length === 0) return;
    setIsRunning(true);
    const currentCode = editorRef.current?.getValue() ?? code;

    setTestCases(prev => prev.map(tc => ({
      ...tc, status: 'RUNNING', output: undefined, error: undefined, exitCode: undefined, time: undefined
    })));

    const results: TestCase[] = [];
    for (const tc of testCases) {
      try {
        // Wire to vanilla JS CompilerUI.execute which returns {stdout, stderr, exitCode}
        const data = await (window as any).CompilerUI.execute(currentCode, tc.input);
        
        let status: TestCase['status'] = 'ERROR';
        if (data.exitCode === 0) {
          const actualOutput = (data.stdout || '').trim();
          const expectedOutput = tc.expected.trim();
          if (expectedOutput === '' || actualOutput === expectedOutput) {
            status = 'AC';
          } else {
            status = 'WA';
          }
        } else {
          status = 'ERROR';
        }

        const resultTc: TestCase = {
          ...tc,
          status,
          output: data.stdout,
          error: data.stderr,
          exitCode: data.exitCode
        };
        results.push(resultTc);
        setTestCases(prev => prev.map(t => t.id === tc.id ? resultTc : t));
      } catch (err: any) {
        const errTc: TestCase = { ...tc, status: 'ERROR', error: err.message };
        results.push(errTc);
        setTestCases(prev => prev.map(t => t.id === tc.id ? errTc : t));
      }
    }
    setIsRunning(false);
  }, [isRunning, testCases, code]);

  useEffect(() => {
    if (shouldAutoRun && !isRunning && testCases.length > 0) {
      setShouldAutoRun(false);
      handleRun();
    }
  }, [shouldAutoRun, isRunning, testCases.length, handleRun]);

  const handleAiReview = useCallback(async () => {
    const currentCode = editorRef.current?.getValue() ?? code;
    if (!currentCode.trim()) return;
    setReviewOpen(true);
    setReviewContent('Connecting to AI...');
    setIsReviewStreaming(false);
    
    // Simulate or call the backend analysis
    try {
        const session = await (window as any).FirebaseClient.getSession();
        const resp = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + session?.access_token
            },
            body: JSON.stringify({
                code: currentCode,
                compilerOutput: "",
                problemText: ""
            })
        });
        const data = await resp.json();
        setReviewContent(data.explanation || data.error_type || "Analysis complete.");
    } catch(e) {
        setReviewContent('Analysis failed: ' + e);
    }
  }, [code]);

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '800px' }}>
      <SplitPane
        defaultLeftPercent={28} minLeft={260} minRight={420} direction="horizontal"
        left={
          <div id="left-panel-container" style={{ width: '100%', height: '100%' }}>
            <LeftPanel 
              onGenerateTests={handleGenerateTests} isGenerating={isGenerating}
              autoRunOnGenerate={autoRunOnGenerate} onToggleAutoRun={() => setAutoRunOnGenerate(!autoRunOnGenerate)}
              problemSummary={problemSummary}
            />
          </div>
        }
        right={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <SplitPane
              direction="vertical" defaultLeftPercent={60} minLeft={100} minRight={100}
              left={
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <EditorToolbar
                    language={language} onLanguageChange={handleLanguageChange}
                    saveHistory={saveHistory} onSaveHistoryToggle={() => setSaveHistory(!saveHistory)}
                    onDownload={() => {}} onAiReview={handleAiReview} onRun={handleRun} isRunning={isRunning}
                  />
                  <CodeEditor language={language} value={code} onChange={setCode} editorRef={editorRef} />
                </div>
              }
              right={
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <TestCasesPanel testCases={testCases} onAddTestCase={handleAddTestCase} onUpdateTestCase={handleUpdateTestCase} onRemoveTestCase={handleRemoveTestCase} onRun={handleRun} isRunning={isRunning} />
                </div>
              }
            />
          </div>
        }
      />
      <AiReviewPanel open={reviewOpen} onClose={() => setReviewOpen(false)} content={reviewContent} isStreaming={isReviewStreaming} />
    </div>
  );
}
