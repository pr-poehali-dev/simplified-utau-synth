/**
 * PianoRoll Component
 * Canvas-based пианоролл: создание нот кликом, растяжение, удаление.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Note } from '@/lib/synthesizer';

interface PianoRollProps {
  notes: Note[];
  onNotesChange: (notes: Note[]) => void;
  playheadSec: number;
  isPlaying: boolean;
  bpm: number;
}

// Все ноты от B4 до C3 (сверху вниз)
const ALL_NOTES: string[] = [];
const NOTE_NAMES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
for (let oct = 4; oct >= 3; oct--) {
  for (const n of NOTE_NAMES) {
    if (oct === 3 && n !== 'C' && n !== 'C#' && n !== 'D' && n !== 'D#' &&
        n !== 'E' && n !== 'F' && n !== 'F#' && n !== 'G' && n !== 'G#' &&
        n !== 'A' && n !== 'A#' && n !== 'B') continue;
    ALL_NOTES.push(`${n}${oct}`);
  }
}

const ROW_HEIGHT = 20;
const PIANO_WIDTH = 56;
const COL_WIDTH = 80;     // ширина 1 бита
const TOTAL_COLS = 32;

const BLACK_NOTES = new Set(['C#', 'D#', 'F#', 'G#', 'A#']);

function isBlackNote(noteName: string): boolean {
  const match = noteName.match(/^([A-G]#?)/);
  return match ? BLACK_NOTES.has(match[1]) : false;
}

// Подсвечиваем C ноты
function isCNote(noteName: string): boolean {
  return noteName.startsWith('C') && !noteName.startsWith('C#');
}

export const PianoRoll: React.FC<PianoRollProps> = ({
  notes, onNotesChange, playheadSec, isPlaying, bpm
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pendingNote, setPendingNote] = useState<{
    x: number; y: number; row: number; col: number;
  } | null>(null);
  const [lyricInput, setLyricInput] = useState('');
  const [lyricDialogOpen, setLyricDialogOpen] = useState(false);

  const draggingRef = useRef<{ noteId: string; startX: number; origDur: number } | null>(null);
  const animFrameRef = useRef<number>(0);

  const secPerBeat = 60 / bpm;
  const colDurSec = secPerBeat / 4; // 1 колонка = 1/4 бита

  // Определяем размер canvas
  const canvasWidth = PIANO_WIDTH + COL_WIDTH * TOTAL_COLS;
  const canvasHeight = ROW_HEIGHT * ALL_NOTES.length;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Фон
    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Сетка строк
    ALL_NOTES.forEach((note, i) => {
      const y = i * ROW_HEIGHT;
      const isBlack = isBlackNote(note);
      const isC = isCNote(note);

      // Фон строки
      ctx.fillStyle = isBlack ? '#131313' : '#161616';
      ctx.fillRect(PIANO_WIDTH, y, canvas.width - PIANO_WIDTH, ROW_HEIGHT);

      // C-ноты — слабая подсветка
      if (isC) {
        ctx.fillStyle = 'rgba(139, 26, 26, 0.06)';
        ctx.fillRect(PIANO_WIDTH, y, canvas.width - PIANO_WIDTH, ROW_HEIGHT);
      }

      // Горизонтальная линия
      ctx.strokeStyle = isC ? 'rgba(139, 26, 26, 0.3)' : 'rgba(139, 115, 85, 0.12)';
      ctx.lineWidth = isC ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(PIANO_WIDTH, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    });

    // Вертикальные линии сетки
    for (let col = 0; col <= TOTAL_COLS; col++) {
      const x = PIANO_WIDTH + col * COL_WIDTH;
      const isBeat = col % 4 === 0;
      const isMeasure = col % 16 === 0;
      ctx.strokeStyle = isMeasure
        ? 'rgba(201, 168, 76, 0.3)'
        : isBeat
        ? 'rgba(139, 26, 26, 0.2)'
        : 'rgba(139, 115, 85, 0.08)';
      ctx.lineWidth = isMeasure ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Пианино (левая панель)
    ALL_NOTES.forEach((note, i) => {
      const y = i * ROW_HEIGHT;
      const isBlack = isBlackNote(note);
      const isC = isCNote(note);

      // Клавиша
      ctx.fillStyle = isBlack ? '#111' : '#1A1A1A';
      ctx.fillRect(0, y + 0.5, PIANO_WIDTH - 1, ROW_HEIGHT - 1);

      // Акцент белых клавиш
      if (!isBlack) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(0, y + 0.5, PIANO_WIDTH - 1, ROW_HEIGHT - 1);
      }

      // Метка C нот
      if (isC) {
        ctx.fillStyle = '#C9A84C';
        ctx.font = '9px "Shippori Mincho", serif';
        ctx.textAlign = 'right';
        ctx.fillText(note, PIANO_WIDTH - 4, y + ROW_HEIGHT - 5);
      }

      // Разделитель клавиши
      ctx.strokeStyle = 'rgba(139, 115, 85, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_HEIGHT);
      ctx.lineTo(PIANO_WIDTH, y + ROW_HEIGHT);
      ctx.stroke();
    });

    // Ноты
    notes.forEach(note => {
      const rowIdx = ALL_NOTES.indexOf(note.pitch);
      if (rowIdx === -1) return;

      const x = PIANO_WIDTH + note.col * COL_WIDTH;
      const y = rowIdx * ROW_HEIGHT;
      const w = Math.max(COL_WIDTH * 0.5, (note.duration / colDurSec) * COL_WIDTH);
      const h = ROW_HEIGHT - 1;

      // Тень ноты
      ctx.shadowColor = 'rgba(192, 57, 43, 0.5)';
      ctx.shadowBlur = 6;

      // Заливка
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, 'rgba(192, 57, 43, 0.9)');
      grad.addColorStop(1, 'rgba(139, 26, 26, 0.8)');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, y + 0.5, w - 2, h);

      ctx.shadowBlur = 0;

      // Граница
      ctx.strokeStyle = '#C0392B';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 0.5, w - 2, h);

      // Ручка растяжения справа
      ctx.fillStyle = '#C9A84C';
      ctx.fillRect(x + w - 5, y + 1, 3, h - 2);

      // Текст ноты (хирагана)
      ctx.fillStyle = '#F5EDD6';
      ctx.font = `${Math.min(14, ROW_HEIGHT - 4)}px "Noto Serif JP", serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const clipW = w - 10;
      if (clipW > 10) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 3, y, clipW, ROW_HEIGHT);
        ctx.clip();
        ctx.fillText(note.lyric, x + 4, y + ROW_HEIGHT / 2);
        ctx.restore();
      }
    });

    // Playhead
    if (isPlaying || playheadSec > 0) {
      const playX = PIANO_WIDTH + (playheadSec / colDurSec) * COL_WIDTH;
      ctx.strokeStyle = '#C9A84C';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Треугольник-указатель
      ctx.fillStyle = '#C9A84C';
      ctx.beginPath();
      ctx.moveTo(playX - 5, 0);
      ctx.lineTo(playX + 5, 0);
      ctx.lineTo(playX, 8);
      ctx.fill();
    }
  }, [notes, playheadSec, isPlaying, colDurSec]);

  useEffect(() => {
    const animate = () => {
      draw();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Обработка клика
  const getCell = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    if (x < PIANO_WIDTH) return null;
    const col = Math.floor((x - PIANO_WIDTH) / COL_WIDTH);
    const row = Math.floor(y / ROW_HEIGHT);
    return { x, y, col, row };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = getCell(e);
    if (!cell) return;

    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const clickX = (e.clientX - rect.left) * scaleX;

    // Проверяем, кликнули ли на ручку растяжения существующей ноты
    for (const note of notes) {
      const rowIdx = ALL_NOTES.indexOf(note.pitch);
      if (rowIdx === -1) continue;
      const noteX = PIANO_WIDTH + note.col * COL_WIDTH;
      const noteW = Math.max(COL_WIDTH * 0.5, (note.duration / colDurSec) * COL_WIDTH);
      const noteY = rowIdx * ROW_HEIGHT;
      const noteRowIdx = rowIdx;

      if (
        clickX >= noteX + noteW - 12 &&
        clickX <= noteX + noteW + 2 &&
        cell.row === noteRowIdx
      ) {
        draggingRef.current = { noteId: note.id, startX: e.clientX, origDur: note.duration };
        return;
      }

      // Клик по существующей ноте — удаление
      if (
        clickX >= noteX + 1 &&
        clickX <= noteX + noteW - 12 &&
        cell.row === rowIdx
      ) {
        onNotesChange(notes.filter(n => n.id !== note.id));
        return;
      }
    }

    // Пустая ячейка — создаём ноту
    if (cell.row >= 0 && cell.row < ALL_NOTES.length && cell.col >= 0 && cell.col < TOTAL_COLS) {
      setPendingNote({ x: cell.x, y: cell.y, row: cell.row, col: cell.col });
      setLyricInput('');
      setLyricDialogOpen(true);
    }
  }, [notes, onNotesChange, colDurSec, getCell]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const drag = draggingRef.current;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const deltaX = (e.clientX - drag.startX) * scaleX;
    const deltaDur = (deltaX / COL_WIDTH) * colDurSec;
    const newDur = Math.max(colDurSec * 0.5, drag.origDur + deltaDur);

    onNotesChange(notes.map(n =>
      n.id === drag.noteId ? { ...n, duration: newDur } : n
    ));
  }, [notes, onNotesChange, colDurSec]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const confirmLyric = () => {
    if (!pendingNote || !lyricInput.trim()) {
      setLyricDialogOpen(false);
      setPendingNote(null);
      return;
    }

    const pitch = ALL_NOTES[pendingNote.row];
    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random()}`,
      pitch,
      duration: colDurSec * 2,
      lyric: lyricInput.trim(),
      startTime: pendingNote.col * colDurSec,
      col: pendingNote.col,
      row: pendingNote.row,
    };
    onNotesChange([...notes, newNote]);
    setLyricDialogOpen(false);
    setPendingNote(null);
    setLyricInput('');
  };

  return (
    <div className="relative flex flex-col h-full" ref={containerRef}>
      {/* Canvas */}
      <div className="overflow-auto flex-1" style={{ background: '#0D0D0D' }}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{
            display: 'block',
            cursor: 'crosshair',
            imageRendering: 'pixelated',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Диалог ввода лирики */}
      {lyricDialogOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setLyricDialogOpen(false)}
        >
          <div
            className="note-dialog animate-fade-in"
            style={{ minWidth: 280 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="panel-header mb-3" style={{ color: '#C9A84C' }}>
              音節入力 — Введите слог
            </div>
            <div className="text-xs mb-2" style={{ color: '#8B7355' }}>
              {pendingNote && ALL_NOTES[pendingNote.row]} • Хирагана (あ, い, う, か...)
            </div>
            <input
              autoFocus
              className="note-input mb-3"
              value={lyricInput}
              onChange={e => setLyricInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmLyric();
                if (e.key === 'Escape') setLyricDialogOpen(false);
              }}
              placeholder="あ"
              maxLength={3}
            />
            {/* Быстрые кнопки хираганы */}
            <div className="flex flex-wrap gap-1 mb-3">
              {['あ','い','う','え','お','か','き','く','け','こ','さ','な','は','ま','ら'].map(k => (
                <button
                  key={k}
                  onClick={() => setLyricInput(k)}
                  style={{
                    background: lyricInput === k ? 'var(--crimson)' : '#1a1a1a',
                    border: '1px solid var(--gold-dim)',
                    color: lyricInput === k ? '#F5EDD6' : '#C9A84C',
                    padding: '4px 8px',
                    fontSize: 16,
                    cursor: 'pointer',
                    fontFamily: 'Noto Serif JP, serif',
                    transition: 'all 0.15s',
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmLyric}
                className="transport-btn active flex-1"
              >
                確認 OK
              </button>
              <button
                onClick={() => setLyricDialogOpen(false)}
                className="transport-btn"
                style={{ flex: 1 }}
              >
                取消 Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
