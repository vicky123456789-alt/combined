'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftPercent?: number;
  minLeft?: number;   // px
  minRight?: number;  // px
  direction?: 'horizontal' | 'vertical';
}

/**
 * Split pane with a draggable divider.
 * Uses pointer capture so dragging outside the divider still works.
 */
export default function SplitPane({
  left,
  right,
  defaultLeftPercent = 38,
  minLeft = 240,
  minRight = 400,
  direction = 'horizontal',
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(defaultLeftPercent);
  const dragging = useRef(false);

  const isHoriz = direction === 'horizontal';

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    if (isHoriz) {
      const newLeftPx = e.clientX - rect.left;
      const clampedLeft = Math.max(minLeft, Math.min(newLeftPx, rect.width - minRight));
      setLeftPct((clampedLeft / rect.width) * 100);
    } else {
      const newTopPx = e.clientY - rect.top;
      const clampedTop = Math.max(minLeft, Math.min(newTopPx, rect.height - minRight));
      setLeftPct((clampedTop / rect.height) * 100);
    }
  }, [minLeft, minRight, isHoriz]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: isHoriz ? 'row' : 'column', flex: 1, overflow: 'hidden', position: 'relative' }}
    >
      {/* First pane */}
      <div style={{ 
        [isHoriz ? 'width' : 'height']: `${leftPct}%`, 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          [isHoriz ? 'width' : 'height']: '5px',
          flexShrink: 0,
          background: 'var(--border)',
          cursor: isHoriz ? 'col-resize' : 'row-resize',
          position: 'relative',
          zIndex: 10,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(98,116,245,0.5)'; }}
        onMouseLeave={e => { if (!dragging.current) e.currentTarget.style.background = 'var(--border)'; }}
      >
        {/* Visual dots on divider */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: isHoriz ? 'column' : 'row',
            gap: '3px',
          }}
        >
          {[0,1,2].map(i => (
            <div
              key={i}
              style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--surface-400)' }}
            />
          ))}
        </div>
      </div>

      {/* Second pane */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {right}
      </div>
    </div>
  );
}
