/**
 * UTAU Synthesizer — Main App
 * Modern grey UI, English interface
 */

import React, { useState, useRef, useCallback } from 'react';
import { PianoRoll } from '@/components/PianoRoll';
import { Note, synthesizeNotes, audioBufferToWav, downloadBlob } from '@/lib/synthesizer';
import { OTO_INI, HIRAGANA_ROWS, VoiceGender } from '@/lib/voicebank';
import Icon from '@/components/ui/icon';

type Tab = 'piano' | 'voice' | 'params' | 'export';

const Index: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<Tab>('piano');
  const [bpm, setBpm] = useState(90);
  const [gender, setGender] = useState<VoiceGender>('male');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [status, setStatus] = useState('Ready');
  const [isExporting, setIsExporting] = useState(false);

  const [otoKana, setOtoKana] = useState('あ');
  const [otoVals, setOtoVals] = useState({ offset: 10, consonant: 80, preutterance: 60, overlap: 40 });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);

  const getCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (_e) { void _e; }
      sourceRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setPlayheadSec(0);
  }, []);

  const play = useCallback(async () => {
    if (isPlaying) { stop(); return; }
    if (notes.length === 0) { setStatus('Add notes to the piano roll first'); return; }

    setStatus('Synthesizing…');
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      const buf = await synthesizeNotes(ctx, notes, gender);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => { setIsPlaying(false); setPlayheadSec(0); cancelAnimationFrame(rafRef.current); setStatus('Playback complete'); };

      sourceRef.current = src;
      playStartRef.current = ctx.currentTime;
      setIsPlaying(true);
      setStatus('Playing…');

      const tick = () => {
        const ctx2 = audioCtxRef.current;
        if (!ctx2) return;
        setPlayheadSec(ctx2.currentTime - playStartRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.error(e);
      setStatus('Synthesis error — check console');
    }
  }, [isPlaying, notes, gender, stop]);

  const exportWav = useCallback(async () => {
    if (notes.length === 0) { setStatus('No notes to export'); return; }
    setIsExporting(true);
    setStatus('Rendering WAV…');
    try {
      const ctx = new OfflineAudioContext(1, 44100 * 60, 44100);
      const buf = await synthesizeNotes(ctx as unknown as AudioContext, notes, gender);
      const wav = audioBufferToWav(buf);
      downloadBlob(new Blob([wav], { type: 'audio/wav' }), 'utau_output.wav');
      setStatus('WAV saved');
    } catch (e) {
      console.error(e);
      setStatus('Export failed');
    }
    setIsExporting(false);
  }, [notes, gender]);

  const clear = useCallback(() => { stop(); setNotes([]); setStatus('Cleared'); }, [stop]);

  const selectOtoKana = (k: string) => {
    setOtoKana(k);
    const e = OTO_INI[k];
    if (e) setOtoVals({ offset: e.offset, consonant: e.consonant, preutterance: e.preutterance, overlap: e.overlap });
  };

  const updateOto = (field: keyof typeof otoVals, val: number) => {
    setOtoVals(prev => {
      const next = { ...prev, [field]: val };
      if (OTO_INI[otoKana]) {
        OTO_INI[otoKana] = { ...OTO_INI[otoKana], ...next };
      }
      return next;
    });
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'piano',  label: 'Piano Roll', icon: 'Music2' },
    { id: 'voice',  label: 'Voice',      icon: 'Mic' },
    { id: 'params', label: 'Parameters', icon: 'Sliders' },
    { id: 'export', label: 'Export',     icon: 'Download' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 48,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--accent-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="Music2" size={15} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.1 }}>UTAU Synth</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Web Synthesizer</div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-mid)', margin: '0 4px' }} />

        {/* Transport */}
        <button onClick={play} className={`btn ${isPlaying ? 'btn-primary' : 'btn-ghost'}`}>
          <Icon name={isPlaying ? 'Square' : 'Play'} size={13} />
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <button onClick={stop} className="btn btn-ghost btn-icon" disabled={!isPlaying} title="Reset">
          <Icon name="SkipBack" size={13} />
        </button>
        <button onClick={clear} className="btn btn-danger btn-sm">
          <Icon name="Trash2" size={12} />
          Clear
        </button>

        <div style={{ width: 1, height: 24, background: 'var(--border-mid)', margin: '0 4px' }} />

        {/* BPM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>BPM</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', minWidth: 30 }}>{bpm}</span>
          <input type="range" min={60} max={180} value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="synth-slider"
            style={{ width: 90, '--pct': `${((bpm - 60) / 120) * 100}%` } as React.CSSProperties}
          />
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-mid)', margin: '0 4px' }} />

        {/* Voice gender quick toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Voice</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['male', 'female'] as VoiceGender[]).map(g => (
              <button key={g} onClick={() => setGender(g)}
                className={`btn btn-sm ${gender === g ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px', fontSize: 11 }}>
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Notes count + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="status-dot" style={{ background: isPlaying ? '#f59e0b' : 'var(--accent-green)', boxShadow: isPlaying ? '0 0 6px rgba(245,158,11,0.6)' : undefined }} />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{status}</span>
          </div>
          <div style={{
            padding: '3px 8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-dim)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--text-2)',
          }}>
            <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{notes.length}</span> notes
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Playhead time */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
          <Icon name="Clock" size={11} />
          {playheadSec.toFixed(2)}s
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Piano Roll */}
        {tab === 'piano' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '5px 12px',
              fontSize: 11,
              color: 'var(--text-3)',
              background: 'var(--bg-panel)',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              gap: 16,
              flexShrink: 0,
            }}>
              <span><span style={{ color: 'var(--text-2)' }}>Click empty cell</span> — create note</span>
              <span><span style={{ color: 'var(--text-2)' }}>Click note</span> — delete</span>
              <span><span style={{ color: 'var(--text-2)' }}>Double-click note</span> — edit lyric & duration</span>
              <span><span style={{ color: 'var(--text-2)' }}>Drag right edge</span> — resize</span>
            </div>
            <PianoRoll
              notes={notes}
              onNotesChange={setNotes}
              playheadSec={playheadSec}
              isPlaying={isPlaying}
              bpm={bpm}
            />
          </div>
        )}

        {/* Voice Tab */}
        {tab === 'voice' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <div className="section-label">Voicebank Selection</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, marginTop: 4 }}>
                Voice Settings
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
                Choose between male and female formant profiles. Changes apply on next synthesis.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {([
                  { g: 'male' as VoiceGender, icon: '♂', name: 'OTOKO — Male', desc: 'Bass-baritone range · F1/F2 300–1100 Hz · Deep character' },
                  { g: 'female' as VoiceGender, icon: '♀', name: 'ONNA — Female', desc: 'Soprano range · F1/F2 380–1300 Hz · Bright, airy timbre' },
                ]).map(({ g, icon, name, desc }) => (
                  <div key={g} className={`voice-card ${gender === g ? 'selected' : ''}`} onClick={() => setGender(g)}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 8,
                      background: gender === g ? 'var(--accent-blue)' : 'var(--bg-panel)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, flexShrink: 0,
                      border: '1px solid var(--border-mid)',
                    }}>{icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{desc}</div>
                    </div>
                    {gender === g && <div className="status-dot" />}
                  </div>
                ))}
              </div>

              {/* Formant table */}
              <div className="section-label">Formant Profile — {gender === 'male' ? 'Male' : 'Female'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
                {(['a','i','u','e','o'] as const).map((v, idx) => {
                  const mf = [[700,1100,2640],[280,2250,2950],[310,870,2350],[490,1870,2650],[450,800,2620]];
                  const ff = [[900,1300,3000],[380,2700,3300],[430,1200,2800],[620,2200,3000],[560,1000,2900]];
                  const f = gender === 'male' ? mf[idx] : ff[idx];
                  const kana = ['あ','い','う','え','お'][idx];
                  return (
                    <div key={v} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontFamily: 'Noto Sans JP, sans-serif', color: 'var(--accent-blue)', marginBottom: 4 }}>{kana}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>F1 {f[0]}Hz</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>F2 {f[1]}Hz</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>F3 {f[2]}Hz</div>
                    </div>
                  );
                })}
              </div>

              {/* Hiragana coverage */}
              <div className="section-label" style={{ marginTop: 20 }}>Supported Syllables ({HIRAGANA_ROWS.flatMap(r => r.kana).length} total)</div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 14 }}>
                {HIRAGANA_ROWS.map(row => (
                  <div key={row.label} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{row.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.kana.map(k => (
                        <span key={k} style={{
                          padding: '3px 6px',
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-dim)',
                          borderRadius: 3,
                          fontSize: 14,
                          color: 'var(--text-2)',
                          fontFamily: 'Noto Sans JP, sans-serif',
                        }}>{k}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Parameters Tab */}
        {tab === 'params' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <div className="section-label">OTO.ini Configuration</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, marginTop: 4 }}>
                Synthesis Parameters
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
                Adjust timing parameters per syllable. Changes apply immediately to next playback.
              </p>

              {/* Syllable picker */}
              <div className="section-label">Select Syllable</div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 220, overflowY: 'auto' }}>
                {HIRAGANA_ROWS.map(row => (
                  <div key={row.label} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{row.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.kana.map(k => (
                        <button key={k} onClick={() => selectOtoKana(k)}
                          className={`kana-btn ${otoKana === k ? 'selected' : ''}`}>{k}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* OTO params */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Noto Sans JP, sans-serif', fontSize: 22, color: 'var(--accent-blue)' }}>{otoKana}</span>
                  OTO Parameters
                </div>
                {([
                  { key: 'offset',        label: 'Offset',        desc: 'Start offset (silence skip)',         min: 0, max: 200 },
                  { key: 'consonant',     label: 'Consonant',     desc: 'Consonant section duration',          min: 0, max: 300 },
                  { key: 'preutterance', label: 'Preutterance',  desc: 'Pre-utterance lead-in point',         min: 0, max: 200 },
                  { key: 'overlap',       label: 'Overlap',       desc: 'Crossfade overlap with previous',     min: 0, max: 150 },
                ] as const).map(p => (
                  <div key={p.key} className="param-row">
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{p.desc}</div>
                    </div>
                    <input
                      type="range" min={p.min} max={p.max} value={otoVals[p.key]}
                      onChange={e => updateOto(p.key, Number(e.target.value))}
                      className="synth-slider"
                      style={{ '--pct': `${((otoVals[p.key] - p.min) / (p.max - p.min)) * 100}%` } as React.CSSProperties}
                    />
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--accent-blue)', minWidth: 48 }}>
                      {otoVals[p.key]}ms
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 14, padding: 10, background: 'var(--bg-base)', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>
                  # OTO.ini preview<br />
                  <span style={{ color: 'var(--text-2)' }}>
                    {otoKana}.wav={otoKana},{otoVals.offset},{otoVals.consonant},{otoVals.preutterance},{otoVals.overlap},0
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Tab */}
        {tab === 'export' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              <div className="section-label">Audio Export</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, marginTop: 4 }}>
                Export
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
                Render all notes to audio. Currently on piano roll: <strong style={{ color: 'var(--accent-blue)' }}>{notes.length} notes</strong>
              </p>

              {notes.length === 0 && (
                <div style={{ padding: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#fca5a5' }}>
                  No notes on the piano roll. Add notes before exporting.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="FileAudio" size={18} style={{ color: 'var(--accent-blue)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>WAV — PCM 16-bit</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Lossless · 44 100 Hz · Mono</div>
                    </div>
                  </div>
                  <button onClick={exportWav} disabled={isExporting || notes.length === 0}
                    className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}>
                    <Icon name={isExporting ? 'Loader' : 'Download'} size={14} />
                    {isExporting ? 'Rendering…' : 'Save as WAV'}
                  </button>
                </div>
              </div>

              {/* Synthesis info */}
              <div className="section-label">Synthesis Info</div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {[
                    ['Engine',        'Formant + concatenative'],
                    ['Sample rate',   '44 100 Hz'],
                    ['Channels',      'Mono'],
                    ['Crossfade',     'OTO.ini overlap'],
                    ['Harmonics',     'Male 14 · Female 10'],
                    ['Voicebank',     gender === 'male' ? 'OTOKO (Male)' : 'ONNA (Female)'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-dim)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: 22,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>UTAU Web Synthesizer v1.1</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Web Audio API · Formant synthesis</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
          {gender === 'male' ? '♂ Male' : '♀ Female'} · {bpm} BPM
        </span>
      </div>
    </div>
  );
};

export default Index;