/**
 * UTAU Synthesizer Engine
 * Конкатенативный синтез с crossfade через OTO.ini overlap.
 */

import { generateSample, OTO_INI, noteToFrequency, VoiceGender } from './voicebank';

export interface Note {
  id: string;
  pitch: string;      // "C4", "D#3" и т.п.
  duration: number;   // секунды
  lyric: string;      // хирагана
  startTime: number;  // позиция на таймлайне (сек)
  col: number;
  row: number;
}

export async function synthesizeNotes(
  ctx: AudioContext,
  notes: Note[],
  gender: VoiceGender = 'male'
): Promise<AudioBuffer> {
  if (notes.length === 0) {
    return ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  }

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const totalDur = sorted.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0) + 0.5;
  const totalSamples = Math.floor(ctx.sampleRate * totalDur);
  const out = ctx.createBuffer(1, totalSamples, ctx.sampleRate);
  const outData = out.getChannelData(0);

  for (const note of sorted) {
    const oto = OTO_INI[note.lyric] ?? { offset: 10, consonant: 0, preutterance: 10, overlap: 20, cutoff: 30 };
    const freq = noteToFrequency(note.pitch);
    const sampleDur = note.duration + oto.cutoff / 1000;
    const buf = generateSample(ctx, note.lyric, freq, sampleDur, gender);
    const bufData = buf.getChannelData(0);

    const startSec = note.startTime - oto.preutterance / 1000;
    const startSample = Math.max(0, Math.floor(startSec * ctx.sampleRate));
    const xfadeSamples = Math.floor((oto.overlap / 1000) * ctx.sampleRate);

    for (let s = 0; s < buf.length; s++) {
      const idx = startSample + s;
      if (idx >= totalSamples) break;

      let gain = 1.0;
      if (s < xfadeSamples && xfadeSamples > 0) gain = s / xfadeSamples;
      const fadeStart = Math.floor(note.duration * ctx.sampleRate) - xfadeSamples;
      if (s > fadeStart && fadeStart > 0) {
        gain *= Math.max(0, 1 - (s - fadeStart) / (buf.length - fadeStart));
      }

      outData[idx] += bufData[s] * gain;
    }
  }

  let peak = 0;
  for (let i = 0; i < outData.length; i++) peak = Math.max(peak, Math.abs(outData[i]));
  if (peak > 0.01) {
    const scale = 0.88 / peak;
    for (let i = 0; i < outData.length; i++) outData[i] *= scale;
  }

  return out;
}

export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bps = 2;
  const ba = numCh * bps;
  const dataSize = len * ba;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);

  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ba, true); v.setUint16(32, ba, true);
  v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return ab;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
