/**
 * UTAU Synthesizer — Main Application
 * Японская эстетика + пианоролл + Web Audio синтез + экспорт
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PianoRoll } from '@/components/PianoRoll';
import { Note, synthesizeNotes, audioBufferToWav, downloadBlob } from '@/lib/synthesizer';
import { OTO_INI } from '@/lib/voicebank';
import Icon from '@/components/ui/icon';

type Tab = 'piano' | 'voice' | 'export' | 'params';

const HIRAGANA_GRID = [
  ['あ','い','う','え','お'],
  ['か','き','く','け','こ'],
  ['さ','し','す','せ','そ'],
  ['た','ち','つ','て','と'],
  ['な','に','ぬ','ね','の'],
  ['は','ひ','ふ','へ','ほ'],
  ['ま','み','む','め','も'],
  ['ら','り','る','れ','ろ'],
];

const Index: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('piano');
  const [bpm, setBpm] = useState(90);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [statusMsg, setStatusMsg] = useState('準備完了 — Готов к работе');
  const [synthParams, setSynthParams] = useState({
    selectedKana: 'あ',
    offset: 10,
    consonant: 80,
    preutterance: 60,
    overlap: 40,
  });
  const [isExporting, setIsExporting] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const playStartSecRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const stopPlayback = useCallback(() => {
    if (playbackSourceRef.current) {
      try { playbackSourceRef.current.stop(); } catch (_e) { void _e; }
      playbackSourceRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setPlayheadSec(0);
    playStartSecRef.current = 0;
  }, []);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (notes.length === 0) {
      setStatusMsg('⚠ Добавьте ноты на пианоролл');
      return;
    }

    setStatusMsg('合成中... Синтез...');
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      const buffer = await synthesizeNotes(ctx, notes);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => {
        setIsPlaying(false);
        setPlayheadSec(0);
        cancelAnimationFrame(rafRef.current);
        setStatusMsg('完了 — Воспроизведение завершено');
      };

      playbackSourceRef.current = source;
      playStartTimeRef.current = ctx.currentTime;
      playStartSecRef.current = 0;
      setIsPlaying(true);
      setStatusMsg('再生中 — Воспроизведение...');

      const animate = () => {
        const ctx2 = audioCtxRef.current;
        if (!ctx2) return;
        const elapsed = ctx2.currentTime - playStartTimeRef.current;
        setPlayheadSec(elapsed);
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    } catch (err) {
      console.error(err);
      setStatusMsg('エラー — Ошибка синтеза');
    }
  }, [isPlaying, notes, stopPlayback]);

  const handleExportWav = useCallback(async () => {
    if (notes.length === 0) {
      setStatusMsg('⚠ Нет нот для экспорта');
      return;
    }
    setIsExporting(true);
    setStatusMsg('WAV出力中... Экспорт WAV...');
    try {
      const ctx = new OfflineAudioContext(1, 44100 * 30, 44100);
      const buffer = await synthesizeNotes(ctx as unknown as AudioContext, notes);
      const wavData = audioBufferToWav(buffer);
      const blob = new Blob([wavData], { type: 'audio/wav' });
      downloadBlob(blob, 'utau_synthesis.wav');
      setStatusMsg('✓ WAV сохранён');
    } catch (err) {
      console.error(err);
      setStatusMsg('エラー — Ошибка экспорта');
    }
    setIsExporting(false);
  }, [notes]);

  const handleClear = useCallback(() => {
    stopPlayback();
    setNotes([]);
    setStatusMsg('クリア — Все ноты удалены');
  }, [stopPlayback]);

  // Синхронизация OTO параметров
  const handleOtoChange = (field: keyof typeof synthParams, val: number) => {
    setSynthParams(prev => {
      const next = { ...prev, [field]: val };
      const kana = next.selectedKana;
      if (OTO_INI[kana]) {
        OTO_INI[kana] = {
          ...OTO_INI[kana],
          offset: next.offset,
          consonant: next.consonant,
          preutterance: next.preutterance,
          overlap: next.overlap,
        };
      }
      return next;
    });
  };

  const selectKana = (kana: string) => {
    const oto = OTO_INI[kana];
    if (oto) {
      setSynthParams({
        selectedKana: kana,
        offset: oto.offset,
        consonant: oto.consonant,
        preutterance: oto.preutterance,
        overlap: oto.overlap,
      });
    }
  };

  const TABS: { id: Tab; label: string; jp: string }[] = [
    { id: 'piano',  label: 'ПИАНОРОЛЛ', jp: 'ピアノロール' },
    { id: 'voice',  label: 'ГОЛОСА',    jp: '声帯' },
    { id: 'params', label: 'ПАРАМЕТРЫ', jp: 'パラメータ' },
    { id: 'export', label: 'ЭКСПОРТ',   jp: 'エクスポート' },
  ];

  return (
    <div className="flex flex-col h-screen" style={{ background: '#0D0D0D', fontFamily: 'Noto Sans JP, sans-serif' }}>
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Header */}
      <header
        style={{
          background: '#0A0A0A',
          borderBottom: '1px solid rgba(139, 115, 85, 0.25)',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: 44,
          flexShrink: 0,
        }}
      >
        {/* Логотип */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28,
            border: '1px solid var(--crimson)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <span style={{ color: '#C0392B', fontSize: 13, fontFamily: 'Shippori Mincho, serif', fontWeight: 700 }}>音</span>
            <div style={{
              position: 'absolute', width: 4, height: 4,
              background: '#C9A84C', borderRadius: '50%',
              top: -2, right: -2,
            }} />
          </div>
          <div>
            <div style={{ fontFamily: 'Shippori Mincho, serif', fontSize: 13, color: '#C9A84C', letterSpacing: '0.15em', lineHeight: 1.1 }}>
              音声合成
            </div>
            <div style={{ fontSize: 8, color: '#8B7355', letterSpacing: '0.2em' }}>
              UTAU SYNTHESIZER
            </div>
          </div>
        </div>

        {/* Декоративная полоса */}
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(139,26,26,0.3), transparent)' }} />

        {/* Транспорт */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={handlePlay} className={`transport-btn ${isPlaying ? 'active' : ''}`}>
            {isPlaying
              ? <><Icon name="Square" size={10} style={{ display: 'inline', marginRight: 4 }} />СТОП</>
              : <><Icon name="Play" size={10} style={{ display: 'inline', marginRight: 4 }} />再生</>
            }
          </button>
          <button onClick={stopPlayback} className="transport-btn" disabled={!isPlaying}>
            <Icon name="SkipBack" size={10} style={{ display: 'inline', marginRight: 4 }} />
            СБРОС
          </button>
          <button onClick={handleClear} className="transport-btn">
            <Icon name="Trash2" size={10} style={{ display: 'inline', marginRight: 4 }} />
            CLEAR
          </button>
        </div>

        {/* BPM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid rgba(139, 115, 85, 0.2)' }}>
          <span style={{ fontSize: 10, color: '#8B7355', letterSpacing: '0.1em', fontFamily: 'Shippori Mincho, serif' }}>BPM</span>
          <span style={{ color: '#C9A84C', fontFamily: 'Shippori Mincho, serif', fontSize: 16, minWidth: 36, textAlign: 'center' }}>
            {bpm}
          </span>
          <input
            type="range" min={60} max={180} value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="utau-slider"
            style={{ width: 80, '--val': `${((bpm - 60) / 120) * 100}%` } as React.CSSProperties}
          />
        </div>

        {/* Счётчик нот */}
        <div style={{ fontSize: 10, color: '#8B7355', letterSpacing: '0.1em', paddingLeft: 8, borderLeft: '1px solid rgba(139, 115, 85, 0.2)' }}>
          <span style={{ color: '#C9A84C', fontFamily: 'Shippori Mincho, serif', fontSize: 14 }}>{notes.length}</span>
          {' '}音符
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background: '#0A0A0A', borderBottom: '1px solid rgba(139, 115, 85, 0.15)', display: 'flex', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`utau-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={{ fontSize: 9, display: 'block', opacity: 0.6 }}>{tab.jp}</span>
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px' }}>
          <span style={{ fontSize: 10, color: '#5a5040', fontFamily: 'Shippori Mincho, serif', letterSpacing: '0.05em' }}>
            {statusMsg}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* Piano Roll Tab */}
        {activeTab === 'piano' && (
          <div className="h-full flex flex-col">
            <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(139, 115, 85, 0.1)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0, background: '#0A0A0A' }}>
              <span style={{ fontSize: 10, color: '#8B7355' }}>
                ← Прокрутите для навигации по пианороллу
              </span>
              <span style={{ fontSize: 10, color: '#5a5040' }}>
                Клик по сетке — новая нота &nbsp;|&nbsp; Клик по ноте — удалить &nbsp;|&nbsp; Тянуть правый край — изменить длину
              </span>
            </div>
            <div className="flex-1 overflow-auto">
              <PianoRoll
                notes={notes}
                onNotesChange={setNotes}
                playheadSec={playheadSec}
                isPlaying={isPlaying}
                bpm={bpm}
              />
            </div>
          </div>
        )}

        {/* Voice Tab */}
        {activeTab === 'voice' && (
          <div className="h-full overflow-auto p-6" style={{ background: '#0D0D0D' }}>
            <div className="max-w-2xl mx-auto">
              <div className="panel-header mb-1">声帯バンク</div>
              <h2 style={{ fontFamily: 'Shippori Mincho, serif', color: '#F5EDD6', fontSize: 22, marginBottom: 4 }}>
                Голосовой банк
              </h2>
              <p style={{ color: '#8B7355', fontSize: 12, marginBottom: 24 }}>
                Мужской японский голос с формантным синтезом через Web Audio API
              </p>

              {/* Voice card */}
              <div className="kamon-border" style={{ padding: 20, marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                  <div style={{
                    width: 52, height: 52,
                    border: '1px solid var(--crimson)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                    background: 'rgba(139, 26, 26, 0.1)',
                  }}>男</div>
                  <div>
                    <div style={{ fontFamily: 'Shippori Mincho, serif', color: '#C9A84C', fontSize: 16, letterSpacing: '0.1em' }}>
                      男性 OTOKO
                    </div>
                    <div style={{ color: '#8B7355', fontSize: 11, letterSpacing: '0.05em', marginTop: 2 }}>
                      Мужской · Японский · Формантный синтез
                    </div>
                    <div style={{ color: '#C0392B', fontSize: 10, marginTop: 4 }}>● АКТИВЕН</div>
                  </div>
                </div>

                <div style={{ color: '#8B7355', fontSize: 11, marginBottom: 12 }}>Поддерживаемые слоги:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {HIRAGANA_GRID.flat().map(k => (
                    <span key={k} style={{
                      background: '#1a1a1a',
                      border: '1px solid rgba(139, 115, 85, 0.3)',
                      color: '#C9A84C',
                      padding: '3px 8px',
                      fontSize: 14,
                      fontFamily: 'Noto Serif JP, serif',
                    }}>{k}</span>
                  ))}
                  <span style={{ color: '#5a5040', fontSize: 11, padding: '3px 4px' }}>ん</span>
                </div>
              </div>

              {/* Formant info */}
              <div style={{ borderTop: '1px solid rgba(139, 115, 85, 0.15)', paddingTop: 16 }}>
                <div className="panel-header mb-3">フォルマント — Форманты гласных</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {(['a','i','u','e','o'] as const).map((v, idx) => {
                    const freqs = [[700,1100,2640],[280,2250,2950],[310,870,2350],[490,1870,2650],[450,800,2620]][idx];
                    const kana = ['あ','い','う','え','お'][idx];
                    return (
                      <div key={v} style={{ background: '#111', border: '1px solid rgba(139, 115, 85, 0.2)', padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Noto Serif JP, serif', fontSize: 20, color: '#C9A84C', marginBottom: 4 }}>{kana}</div>
                        <div style={{ fontSize: 10, color: '#8B7355' }}>F1: {freqs[0]}Hz</div>
                        <div style={{ fontSize: 10, color: '#8B7355' }}>F2: {freqs[1]}Hz</div>
                        <div style={{ fontSize: 10, color: '#5a5040' }}>F3: {freqs[2]}Hz</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Params Tab */}
        {activeTab === 'params' && (
          <div className="h-full overflow-auto p-6" style={{ background: '#0D0D0D' }}>
            <div className="max-w-2xl mx-auto">
              <div className="panel-header mb-1">OTO設定</div>
              <h2 style={{ fontFamily: 'Shippori Mincho, serif', color: '#F5EDD6', fontSize: 22, marginBottom: 4 }}>
                Параметры синтеза OTO.ini
              </h2>
              <p style={{ color: '#8B7355', fontSize: 12, marginBottom: 20 }}>
                Настройте тайминг и форму каждого слога. Изменения применяются немедленно.
              </p>

              {/* Выбор слога */}
              <div className="panel-header mb-2">音節選択 — Выбор слога</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 20 }}>
                {HIRAGANA_GRID.flat().map(k => (
                  <button
                    key={k}
                    onClick={() => selectKana(k)}
                    style={{
                      background: synthParams.selectedKana === k ? 'var(--crimson)' : '#111',
                      border: `1px solid ${synthParams.selectedKana === k ? '#C0392B' : 'rgba(139, 115, 85, 0.25)'}`,
                      color: synthParams.selectedKana === k ? '#F5EDD6' : '#C9A84C',
                      padding: '6px 10px',
                      fontSize: 16,
                      cursor: 'pointer',
                      fontFamily: 'Noto Serif JP, serif',
                      transition: 'all 0.15s',
                    }}
                  >{k}</button>
                ))}
              </div>

              {/* Параметры OTO */}
              <div className="kamon-border" style={{ padding: 20 }}>
                <div style={{ fontFamily: 'Shippori Mincho, serif', color: '#C9A84C', fontSize: 18, marginBottom: 16 }}>
                  {synthParams.selectedKana} — OTO Parameters
                </div>
                {([
                  { key: 'offset',       label: 'Offset',        jp: 'オフセット',      desc: 'Смещение начала звука (мс)', min: 0, max: 200 },
                  { key: 'consonant',    label: 'Consonant',     jp: '子音',           desc: 'Длительность согласной (мс)', min: 0, max: 300 },
                  { key: 'preutterance',label: 'Preutterance',  jp: '先行発声',       desc: 'Точка начала озвучивания (мс)', min: 0, max: 200 },
                  { key: 'overlap',      label: 'Overlap',       jp: 'オーバーラップ', desc: 'Кроссфейд с предыдущей нотой (мс)', min: 0, max: 150 },
                ] as const).map(param => (
                  <div key={param.key} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div>
                        <span style={{ color: '#C9A84C', fontFamily: 'Shippori Mincho, serif', fontSize: 13 }}>{param.label}</span>
                        <span style={{ color: '#5a5040', fontSize: 11, marginLeft: 8 }}>{param.jp}</span>
                      </div>
                      <span style={{ color: '#C0392B', fontFamily: 'Shippori Mincho, serif', fontSize: 14, minWidth: 42, textAlign: 'right' }}>
                        {synthParams[param.key]}ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min={param.min} max={param.max}
                      value={synthParams[param.key]}
                      onChange={e => handleOtoChange(param.key, Number(e.target.value))}
                      className="utau-slider"
                      style={{ width: '100%', '--val': `${((synthParams[param.key] - param.min) / (param.max - param.min)) * 100}%` } as React.CSSProperties}
                    />
                    <div style={{ color: '#5a5040', fontSize: 10, marginTop: 3 }}>{param.desc}</div>
                  </div>
                ))}
              </div>

              {/* OTO.ini visualizer */}
              <div style={{ marginTop: 16, padding: 12, background: '#0A0A0A', border: '1px solid rgba(139,115,85,0.1)', fontFamily: 'monospace' }}>
                <div style={{ color: '#5a5040', fontSize: 10, marginBottom: 6 }}># OTO.ini preview</div>
                <div style={{ color: '#8B7355', fontSize: 11 }}>
                  {synthParams.selectedKana}.wav={synthParams.selectedKana},{synthParams.offset},{synthParams.consonant},{synthParams.preutterance},{synthParams.overlap},0
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="h-full overflow-auto p-6" style={{ background: '#0D0D0D' }}>
            <div className="max-w-xl mx-auto">
              <div className="panel-header mb-1">エクスポート</div>
              <h2 style={{ fontFamily: 'Shippori Mincho, serif', color: '#F5EDD6', fontSize: 22, marginBottom: 4 }}>
                Экспорт аудио
              </h2>
              <p style={{ color: '#8B7355', fontSize: 12, marginBottom: 28 }}>
                Синтезирует все ноты в аудиофайл. Нот на пианоролле: <strong style={{ color: '#C9A84C' }}>{notes.length}</strong>
              </p>

              {notes.length === 0 && (
                <div style={{ border: '1px solid rgba(139,26,26,0.3)', padding: 16, marginBottom: 20, color: '#8B7355', fontSize: 12 }}>
                  ⚠ Добавьте ноты на пианоролл перед экспортом
                </div>
              )}

              {/* WAV Export */}
              <div className="kamon-border" style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, border: '1px solid var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="FileAudio" size={18} style={{ color: '#C9A84C' }} />
                  </div>
                  <div>
                    <div style={{ color: '#C9A84C', fontFamily: 'Shippori Mincho, serif', fontSize: 15 }}>WAV — PCM 16-bit</div>
                    <div style={{ color: '#5a5040', fontSize: 11 }}>Несжатый · 44100 Hz · Моно</div>
                  </div>
                </div>
                <button
                  onClick={handleExportWav}
                  disabled={isExporting || notes.length === 0}
                  className="transport-btn active"
                  style={{ width: '100%', padding: '10px 16px', fontSize: 12 }}
                >
                  {isExporting ? '処理中... Синтез...' : 'WAVとして保存 — Сохранить WAV'}
                </button>
              </div>

              {/* Info */}
              <div style={{ borderTop: '1px solid rgba(139, 115, 85, 0.15)', paddingTop: 16, color: '#5a5040', fontSize: 11 }}>
                <div className="panel-header mb-2">合成情報 — Информация</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['Метод синтеза', 'Формантный + конкатенативный'],
                    ['Частота дискретизации', '44 100 Hz'],
                    ['Каналы', 'Моно'],
                    ['Кроссфейд', 'Overlap из OTO.ini'],
                    ['Гласные', 'ADSR + форманты F1/F2/F3'],
                    ['Голосовой банк', 'Мужской (OTOKO)'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ padding: '6px 0', borderBottom: '1px solid rgba(139,115,85,0.08)' }}>
                      <div style={{ color: '#8B7355', marginBottom: 2 }}>{k}</div>
                      <div style={{ color: '#C9A84C', fontSize: 11 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        height: 24,
        background: '#060606',
        borderTop: '1px solid rgba(139, 115, 85, 0.12)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: '#3a3028', fontFamily: 'Shippori Mincho, serif', letterSpacing: '0.2em' }}>
          音声合成システム v1.0 · Web Audio API · UTAU-compatible
        </span>
        <div style={{ flex: 1 }} />
        {/* Декоративные иероглифы */}
        <span style={{ fontSize: 9, color: '#2a2018', letterSpacing: '0.3em' }}>
          音・響・声・韻
        </span>
      </footer>
    </div>
  );
};

export default Index;