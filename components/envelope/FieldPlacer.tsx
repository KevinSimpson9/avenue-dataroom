'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './pdf-worker-setup';
import type {
  FieldType,
  Recipient,
} from '@/lib/drive/envelopes';
import { Button } from '@/components/ui/Button';

export interface DraftField {
  id?: string;
  recipientId: string;
  type: FieldType;
  page: number;
  /** All coords in PDF points, bottom-left origin (matches pdf-lib). */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  defaultValue: string | null;
}

interface Props {
  pdfUrl: string;
  recipients: Recipient[];
  initial: DraftField[];
  readOnly?: boolean;
  onChange: (fields: DraftField[]) => void;
}

const FIELD_DEFAULTS: Record<FieldType, { w: number; h: number }> = {
  signature: { w: 220, h: 50 },
  initials: { w: 80, h: 36 },
  date: { w: 140, h: 28 },
  text: { w: 180, h: 28 },
};

// Color palette cycled per recipient — picked so backgrounds stay light.
const RECIPIENT_PALETTE = [
  { ring: '#1d3a8a', bg: 'rgba(29, 58, 138, 0.18)' },
  { ring: '#a16207', bg: 'rgba(161, 98, 7, 0.18)' },
  { ring: '#16a34a', bg: 'rgba(22, 163, 74, 0.18)' },
  { ring: '#b91c1c', bg: 'rgba(185, 28, 28, 0.18)' },
  { ring: '#7c3aed', bg: 'rgba(124, 58, 237, 0.18)' },
];

export function FieldPlacer({
  pdfUrl,
  recipients,
  initial,
  readOnly = false,
  onChange,
}: Props) {
  const [fields, setFields] = useState<DraftField[]>(initial);
  const [numPages, setNumPages] = useState(0);
  const [activeRecipientId, setActiveRecipientId] = useState<string>(
    recipients[0]?.id || ''
  );
  const [activeType, setActiveType] = useState<FieldType>('signature');
  const [pageSizes, setPageSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [renderScale, setRenderScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    fieldId: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    onChange(fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const recipientColor = (id: string) => {
    const idx = recipients.findIndex((r) => r.id === id);
    return RECIPIENT_PALETTE[Math.max(0, idx) % RECIPIENT_PALETTE.length];
  };

  function handlePageClick(pageNum: number, e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly || !activeRecipientId) return;
    const target = e.currentTarget;
    // Ignore clicks that started on an existing field.
    if (e.target !== target) return;
    const rect = target.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const pageH = pageSizes[pageNum]?.h ?? 0;
    if (!pageH) return;
    // Convert screen px → PDF points (bottom-left origin).
    const xPt = px / renderScale;
    const yPt = pageH - py / renderScale;
    const defs = FIELD_DEFAULTS[activeType];
    const newField: DraftField = {
      id: undefined,
      recipientId: activeRecipientId,
      type: activeType,
      page: pageNum,
      x: Math.max(0, xPt - defs.w / 2),
      y: Math.max(0, yPt - defs.h / 2),
      width: defs.w,
      height: defs.h,
      required: true,
      defaultValue: null,
    };
    setFields((cur) => [...cur, newField]);
  }

  function beginDrag(
    e: React.MouseEvent,
    field: DraftField,
    idx: number,
    mode: 'move' | 'resize'
  ) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      fieldId: String(idx),
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y,
      origW: field.width,
      origH: field.height,
    };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dxPx = ev.clientX - d.startX;
      const dyPx = ev.clientY - d.startY;
      const dxPt = dxPx / renderScale;
      const dyPt = dyPx / renderScale;
      setFields((cur) =>
        cur.map((f, i) => {
          if (String(i) !== d.fieldId) return f;
          if (d.mode === 'move') {
            return { ...f, x: Math.max(0, d.origX + dxPt), y: Math.max(0, d.origY - dyPt) };
          }
          return {
            ...f,
            width: Math.max(20, d.origW + dxPt),
            height: Math.max(14, d.origH + dyPt),
          };
        })
      );
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function deleteField(idx: number) {
    setFields((cur) => cur.filter((_, i) => i !== idx));
  }

  function onPageLoad(pageNum: number, viewport: { width: number; height: number }) {
    setPageSizes((cur) => ({ ...cur, [pageNum]: { w: viewport.width, h: viewport.height } }));
  }

  // Recompute render scale so pages fit the container.
  useEffect(() => {
    function measure() {
      const w = containerRef.current?.clientWidth ?? 800;
      // Default PDF page is 612pt wide (US letter); render at the smaller of
      // (container width / 612pt, 1.5x for HiDPI legibility).
      const s = Math.min(w / 612, 1.5);
      setRenderScale(s);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="space-y-3">
      {!readOnly ? (
        <Toolbar
          recipients={recipients}
          activeRecipientId={activeRecipientId}
          setActiveRecipientId={setActiveRecipientId}
          activeType={activeType}
          setActiveType={setActiveType}
          recipientColor={recipientColor}
        />
      ) : null}

      <div
        ref={containerRef}
        className="overflow-auto rounded-xl border border-brand-line bg-brand-bg/40 p-4"
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={(d) => setNumPages(d.numPages)}
          loading={<p className="p-6 text-sm text-brand-muted">Loading PDF…</p>}
          error={<p className="p-6 text-sm text-red-700">Could not load PDF.</p>}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const size = pageSizes[pageNum];
            const pageFields = fields
              .map((f, idx) => ({ f, idx }))
              .filter(({ f }) => f.page === pageNum);
            return (
              <div
                key={pageNum}
                className="relative mx-auto mb-6 inline-block shadow-md"
                style={{ width: size ? size.w : undefined }}
              >
                <Page
                  pageNumber={pageNum}
                  scale={renderScale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onLoadSuccess={(p) =>
                    onPageLoad(pageNum, {
                      width: p.width * renderScale,
                      height: p.height * renderScale,
                    })
                  }
                />
                <div
                  className="absolute inset-0"
                  onClick={(e) => handlePageClick(pageNum, e)}
                  style={{ cursor: readOnly ? 'default' : 'crosshair' }}
                >
                  {pageFields.map(({ f, idx }) => {
                    if (!size) return null;
                    const color = recipientColor(f.recipientId);
                    const leftPx = f.x * renderScale;
                    const topPx = size.h - (f.y + f.height) * renderScale;
                    const wPx = f.width * renderScale;
                    const hPx = f.height * renderScale;
                    return (
                      <div
                        key={idx}
                        onMouseDown={(e) => beginDrag(e, f, idx, 'move')}
                        className="absolute flex items-center justify-center text-[10px] font-medium uppercase tracking-wider"
                        style={{
                          left: leftPx,
                          top: topPx,
                          width: wPx,
                          height: hPx,
                          background: color.bg,
                          border: `1.5px solid ${color.ring}`,
                          color: color.ring,
                          borderRadius: 3,
                          cursor: readOnly ? 'default' : 'move',
                        }}
                      >
                        <span className="pointer-events-none px-1">
                          {f.type}
                        </span>
                        {!readOnly ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteField(idx);
                              }}
                              className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white text-xs text-red-700 shadow ring-1 ring-red-200 hover:bg-red-50"
                              title="Delete field"
                            >
                              ×
                            </button>
                            <div
                              onMouseDown={(e) => beginDrag(e, f, idx, 'resize')}
                              className="absolute bottom-0 right-0 h-3 w-3"
                              style={{
                                cursor: 'nwse-resize',
                                background: color.ring,
                                borderTopLeftRadius: 3,
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}

function Toolbar({
  recipients,
  activeRecipientId,
  setActiveRecipientId,
  activeType,
  setActiveType,
  recipientColor,
}: {
  recipients: Recipient[];
  activeRecipientId: string;
  setActiveRecipientId: (id: string) => void;
  activeType: FieldType;
  setActiveType: (t: FieldType) => void;
  recipientColor: (id: string) => { ring: string; bg: string };
}) {
  const types: FieldType[] = ['signature', 'initials', 'date', 'text'];
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-brand-line bg-white px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-brand-muted">For</span>
        <select
          value={activeRecipientId}
          onChange={(e) => setActiveRecipientId(e.target.value)}
          className="rounded border border-brand-line px-2 py-1 text-sm"
        >
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: recipientColor(activeRecipientId).ring }}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs uppercase tracking-wider text-brand-muted">Add</span>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveType(t)}
            className={`rounded-md px-2.5 py-1 text-xs capitalize ${
              activeType === t
                ? 'bg-brand-accent text-white'
                : 'border border-brand-line text-brand-fg hover:bg-brand-bg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-brand-muted">
        Click on the PDF to place a new field. Drag to move; drag the corner to resize.
      </span>
    </div>
  );
}
