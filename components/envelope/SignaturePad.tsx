'use client';

import { useEffect, useRef, useState } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from '@/components/ui/Button';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  width?: number;
  height?: number;
}

/**
 * Canvas signature pad. Returns the trimmed drawing as a PNG data URL via
 * `onChange`. When the user clears, emits `null`.
 */
export function SignaturePad({
  value,
  onChange,
  width = 480,
  height = 160,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    setDpr(ratio);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx?.scale(ratio, ratio);
    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgba(255,255,255,0)',
      penColor: '#1d3a8a',
      minWidth: 0.8,
      maxWidth: 2.2,
    });
    pad.addEventListener('endStroke', () => {
      if (pad.isEmpty()) {
        onChange(null);
      } else {
        onChange(pad.toDataURL('image/png'));
      }
    });
    padRef.current = pad;
    if (value) {
      pad.fromDataURL(value, { ratio });
    }
    return () => {
      pad.off();
      padRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  function clear() {
    padRef.current?.clear();
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-brand-line bg-white">
        <canvas ref={canvasRef} className="block touch-none" />
      </div>
      <div className="flex items-center justify-between text-xs text-brand-muted">
        <span>Draw your signature above (mouse or finger).</span>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>
          Clear
        </Button>
      </div>
      <span className="sr-only">dpr {dpr}</span>
    </div>
  );
}
