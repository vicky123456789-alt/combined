import React from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import WorkspaceApp from './WorkspaceApp';

const container = document.getElementById('react-workspace-root');
if (container) {
  const root = createRoot(container);
  root.render(<WorkspaceApp />);
}
