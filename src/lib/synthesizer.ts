/**
 * UTAU Synthesizer Engine
 * Конкатенативный синтез: генерирует AudioBuffer для последовательности нот,
 * используя OTO.ini параметры и кроссфейд между нотами.
 */

import { generateSample, OTO_INI, noteToFrequency } from './voicebank';

export interface Note {
  id: string;
  pitch: string;        // "C4", "D#3" и т.п.
  duration: number;     // длительность в секундах
  lyric: string;        // хирагана
  startTime: number;    // позиция на тайминлайне (секунды)
  col: number;          // колонка в сетке
  row: number;          // строка в сетке (индекс ноты)
}

/**
 * Синтезирует полный аудио для списка нот.
 * Использует crossfade через overlap из OTO.ini.
 */
export async function synthesizeNotes(
  ctx: AudioContext,
  notes: Note[]
): Promise<AudioBuffer> {
  if (notes.length === 0) {
    return ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  }

  // Сортируем по времени
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  // Считаем общую длительность
  const totalDuration = sorted.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0) + 0.5;
  const totalSamples = Math.floor(ctx.sampleRate * totalDuration);
  const outputBuffer = ctx.createBuffer(1, totalSamples, ctx.sampleRate);
  const outputData = outputBuffer.getChannelData(0);

  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i];
    const oto = OTO_INI[note.lyric] ?? {
      offset: 10, consonant: 0, preutterance: 10, overlap: 20, cutoff: 30
    };

    const freq = noteToFrequency(note.pitch);

    // Генерируем сэмпл чуть длиннее ноты для хвоста
    const sampleDuration = note.duration + oto.cutoff / 1000;
    const sampleBuffer = generateSample(ctx, note.lyric, freq, sampleDuration);
    const sampleData = sampleBuffer.getChannelData(0);

    // Позиция начала в выходном буфере
    // pre-utterance: нота начинается немного раньше своей позиции
    const startSec = note.startTime - oto.preutterance / 1000;
    const startSample = Math.max(0, Math.floor(startSec * ctx.sampleRate));

    // Crossfade: overlap — количество мс пересечения с предыдущей нотой
    const crossfadeSamples = Math.floor((oto.overlap / 1000) * ctx.sampleRate);

    for (let s = 0; s < sampleBuffer.length; s++) {
      const outIdx = startSample + s;
      if (outIdx >= totalSamples) break;

      let gain = 1.0;

      // Fade-in crossfade в начале
      if (s < crossfadeSamples && crossfadeSamples > 0) {
        gain = s / crossfadeSamples;
      }

      // Fade-out в конце ноты
      const fadeOutStart = Math.floor(note.duration * ctx.sampleRate) - crossfadeSamples;
      if (s > fadeOutStart && fadeOutStart > 0) {
        const fadeProgress = (s - fadeOutStart) / (sampleBuffer.length - fadeOutStart);
        gain *= Math.max(0, 1 - fadeProgress);
      }

      outputData[outIdx] += sampleData[s] * gain;
    }
  }

  // Нормализуем
  let peak = 0;
  for (let i = 0; i < outputData.length; i++) {
    peak = Math.max(peak, Math.abs(outputData[i]));
  }
  if (peak > 0.01) {
    const scale = 0.9 / peak;
    for (let i = 0; i < outputData.length; i++) {
      outputData[i] *= scale;
    }
  }

  return outputBuffer;
}

/**
 * Экспортирует AudioBuffer в WAV (PCM 16-bit).
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return wavBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Скачивает blob как файл.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
