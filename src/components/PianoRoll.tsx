/**
 * PianoRoll Component — modern grey UI
 * Canvas grid: create notes by click, resize by dragging right edge, delete by click on body.
 * Double-click on existing note → edit lyric/duration dialog.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Note } from '@/lib/synthesizer';
import { HIRAGANA_ROWS, KANA_MAP } from '@/lib/voicebank';
import Icon from '@/components/ui/icon';

interface PianoRollProps {
  notes: Note[];
  onNotesChange: (notes: Note[]) => void;
  playheadSec: number;
  isPlaying: boolean;
  bpm: number;
}

const ALL_NOTES: string[] = [];
const NOTE_NAMES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
for (let oct = 5; oct >= 2; oct--) {
  for (const n of NOTE_NAMES) {
    ALL_NOTES.push(`${n}${oct}`);
  }
}

const ROW_H = 18;
const PIANO_W = 52;
const COL_W = 64;
const TOTAL_COLS = 48;
const RESIZE_HANDLE_W = 8;

const BLACK = new Set(['C#', 'D#', 'F#', 'G#', 'A#']);
const isBlack = (n: string) => BLACK.has(n.replace(/\d/, ''));
const isC = (n: string) => /^C\d/.test(n) && !n.startsWith('C#');

export const PianoRoll: React.FC<PianoRollProps> = ({
  notes, onNotesChange, playheadSec, isPlaying, bpm
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Dialog state
  const [dialog, setDialog] = useState<{
    mode: 'create' | 'edit';
    noteId?: string;
    row: number; col: number;
    lyric: string;
    duration: number; // in cols
  } | null>(null);

  const draggingRef = useRef<{ noteId: string; startX: number; origDur: number } | null>(null);
  const rafRef = useRef<number>(0);

  const secPerBeat = 60 / bpm;
  const colSec = secPerBeat / 4;

  const canvasW = PIANO_W + COL_W * TOTAL_COLS;
  const canvasH = ROW_H * ALL_NOTES.length;

  // ─── Draw ───────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#111318';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rows
    ALL_NOTES.forEach((note, i) => {
      const y = i * ROW_H;
      ctx.fillStyle = isBlack(note) ? '#13151e' : '#161920';
      ctx.fillRect(PIANO_W, y, canvas.width - PIANO_W, ROW_H);
      if (isC(note)) {
        ctx.fillStyle = 'rgba(59,130,246,0.04)';
        ctx.fillRect(PIANO_W, y, canvas.width - PIANO_W, ROW_H);
      }
      ctx.strokeStyle = isC(note) ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PIANO_W, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    });

    // Vertical grid
    for (let col = 0; col <= TOTAL_COLS; col++) {
      const x = PIANO_W + col * COL_W;
      const isMeasure = col % 16 === 0;
      const isBeat = col % 4 === 0;
      ctx.strokeStyle = isMeasure
        ? 'rgba(255,255,255,0.14)'
        : isBeat
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(255,255,255,0.025)';
      ctx.lineWidth = isMeasure ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }

    // Measure numbers
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    for (let m = 0; m <= TOTAL_COLS / 16; m++) {
      ctx.fillText(`${m + 1}`, PIANO_W + m * 16 * COL_W + 3, 10);
    }

    // Piano keys
    ALL_NOTES.forEach((note, i) => {
      const y = i * ROW_H;
      ctx.fillStyle = isBlack(note) ? '#0f1017' : '#1e2130';
      ctx.fillRect(0, y + 0.5, PIANO_W - 1, ROW_H - 1);

      if (isC(note)) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(PIANO_W - 3, y + 3, 2, ROW_H - 6);
        ctx.fillStyle = '#9ba3b8';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'right';
        ctx.fillText(note, PIANO_W - 6, y + ROW_H - 4);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(PIANO_W, y + ROW_H); ctx.stroke();
    });

    // Notes
    notes.forEach(note => {
      const ri = ALL_NOTES.indexOf(note.pitch);
      if (ri === -1) return;
      const x = PIANO_W + note.col * COL_W;
      const y = ri * ROW_H;
      const w = Math.max(COL_W * 0.5, (note.duration / colSec) * COL_W);
      const h = ROW_H - 2;

      // Shadow
      ctx.shadowColor = 'rgba(59,130,246,0.4)';
      ctx.shadowBlur = 8;

      // Fill
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#4f96ff');
      grad.addColorStop(1, '#2563eb');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w - 2, h, 3);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = 'rgba(147,197,253,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w - 2, h, 3);
      ctx.stroke();

      // Resize handle
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + w - RESIZE_HANDLE_W, y + 3, 2, h - 6);

      // Lyric text
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.min(13, ROW_H - 4)}px 'Noto Sans JP', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (w > 16) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4, y, w - RESIZE_HANDLE_W - 6, ROW_H);
        ctx.clip();
        ctx.fillText(note.lyric, x + 5, y + ROW_H / 2);
        ctx.restore();
      }
    });

    // Playhead
    if (isPlaying || playheadSec > 0) {
      const px = PIANO_W + (playheadSec / colSec) * COL_W;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height); ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 7);
      ctx.fill();
    }
  }, [notes, playheadSec, isPlaying, colSec]);

  useEffect(() => {
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ─── Mouse helpers ───────────────────────────────────────────
  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    const x = (e.clientX - r.left) * sx;
    const y = (e.clientY - r.top) * sy;
    return { x, y, col: Math.floor((x - PIANO_W) / COL_W), row: Math.floor(y / ROW_H) };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, col, row } = getPos(e);
    if (x < PIANO_W) return;

    // Check resize handle
    for (const note of notes) {
      const ri = ALL_NOTES.indexOf(note.pitch);
      if (ri !== row) continue;
      const nx = PIANO_W + note.col * COL_W;
      const nw = Math.max(COL_W * 0.5, (note.duration / colSec) * COL_W);
      if (x >= nx + nw - RESIZE_HANDLE_W - 2 && x <= nx + nw + 2) {
        draggingRef.current = { noteId: note.id, startX: e.clientX, origDur: note.duration };
        return;
      }
    }

    // Check note body — single click = delete
    for (const note of notes) {
      const ri = ALL_NOTES.indexOf(note.pitch);
      if (ri !== row) continue;
      const nx = PIANO_W + note.col * COL_W;
      const nw = Math.max(COL_W * 0.5, (note.duration / colSec) * COL_W);
      if (x >= nx && x < nx + nw - RESIZE_HANDLE_W - 2) {
        if (e.detail === 2) {
          // double-click → edit
          setDialog({ mode: 'edit', noteId: note.id, row: ri, col: note.col, lyric: note.lyric, duration: Math.round(note.duration / colSec) });
        } else {
          onNotesChange(notes.filter(n => n.id !== note.id));
        }
        return;
      }
    }

    // Empty cell → create
    if (row >= 0 && row < ALL_NOTES.length && col >= 0 && col < TOTAL_COLS) {
      setDialog({ mode: 'create', row, col, lyric: '', duration: 2 });
    }
  }, [notes, onNotesChange, colSec, getPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) * (canvas.width / rect.width);
    const newDur = Math.max(colSec * 0.5, drag.origDur + (dx / COL_W) * colSec);
    onNotesChange(notes.map(n => n.id === drag.noteId ? { ...n, duration: newDur } : n));
  }, [notes, onNotesChange, colSec]);

  const handleMouseUp = useCallback(() => { draggingRef.current = null; }, []);

  // ─── Dialog confirm ──────────────────────────────────────────
  const confirmDialog = () => {
    if (!dialog) return;
    const lyric = dialog.lyric.trim();
    if (!lyric) { setDialog(null); return; }

    const pitch = ALL_NOTES[dialog.row];
    const duration = Math.max(0.5, dialog.duration) * colSec;
    const startTime = dialog.col * colSec;

    if (dialog.mode === 'create') {
      const newNote: Note = {
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        pitch, duration, lyric, startTime,
        col: dialog.col, row: dialog.row,
      };
      onNotesChange([...notes, newNote]);
    } else {
      onNotesChange(notes.map(n => n.id === dialog.noteId
        ? { ...n, lyric, duration }
        : n
      ));
    }
    setDialog(null);
  };

  const allKana = HIRAGANA_ROWS.flatMap(r => r.kana);

  return (
    <div className="relative flex flex-col h-full" style={{ background: '#111318' }}>
      <div className="flex-1 overflow-auto">
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Note dialog */}
      {dialog && (
        <div className="note-dialog-overlay" onClick={() => setDialog(null)}>
          <div className="note-dialog" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                  {dialog.mode === 'create' ? 'Add Note' : 'Edit Note'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {ALL_NOTES[dialog.row]} · col {dialog.col + 1}
                </div>
              </div>
              <button onClick={() => setDialog(null)} className="btn btn-ghost btn-icon btn-sm">
                <Icon name="X" size={14} />
              </button>
            </div>

            {/* Lyric input */}
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Lyric (hiragana)</div>
              <input
                autoFocus
                className="kana-input"
                value={dialog.lyric}
                onChange={e => setDialog(d => d ? { ...d, lyric: e.target.value } : d)}
                onKeyDown={e => { if (e.key === 'Enter') confirmDialog(); if (e.key === 'Escape') setDialog(null); }}
                placeholder="あ"
                maxLength={4}
              />
            </div>

            {/* Duration */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>Duration</div>
                <span style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 600 }}>
                  {dialog.duration} {dialog.duration === 1 ? 'beat div' : 'beat divs'}
                  &nbsp;({(dialog.duration * colSec).toFixed(2)}s)
                </span>
              </div>
              <input
                type="range" min={1} max={32} value={dialog.duration}
                onChange={e => setDialog(d => d ? { ...d, duration: Number(e.target.value) } : d)}
                className="synth-slider"
                style={{ '--pct': `${((dialog.duration - 1) / 31) * 100}%` } as React.CSSProperties}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {[1, 2, 4, 8, 16].map(v => (
                  <button key={v} onClick={() => setDialog(d => d ? { ...d, duration: v } : d)}
                    className={`btn btn-ghost btn-sm ${dialog.duration === v ? 'active-play' : ''}`}
                    style={{ padding: '3px 8px', fontSize: 11 }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick kana */}
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Quick select</div>
              <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                {HIRAGANA_ROWS.map(row => (
                  <div key={row.label} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>{row.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {row.kana.map(k => (
                        <button key={k} onClick={() => setDialog(d => d ? { ...d, lyric: k } : d)}
                          className={`kana-btn ${dialog.lyric === k ? 'selected' : ''}`}>
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmDialog} className="btn btn-primary" style={{ flex: 1 }}
                disabled={!dialog.lyric.trim() || !KANA_MAP[dialog.lyric.trim()]}>
                <Icon name="Check" size={13} />
                {dialog.mode === 'create' ? 'Add Note' : 'Save Changes'}
              </button>
              <button onClick={() => setDialog(null)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
            {dialog.lyric.trim() && !KANA_MAP[dialog.lyric.trim()] && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-red)' }}>
                Unknown syllable — use the quick select above
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
