/**
 * UTAU Voicebank Module
 * Генерирует AudioBuffer для каждого слога хираганы через формантный синтез.
 * Имитирует мужской японский голос с характерными формантами гласных.
 */

export interface OtoEntry {
  /** Смещение начала полезного звука (мс) */
  offset: number;
  /** Длительность согласной части (мс), 0 если нет согласной */
  consonant: number;
  /** Точка «pre-utterance» — когда звук «входит» в ноту (мс) */
  preutterance: number;
  /** Overlap с предыдущей нотой (мс) */
  overlap: number;
  /** Длина «хвоста» гласной (мс) */
  cutoff: number;
}

/** Формантные частоты для мужских гласных (F1, F2, F3) */
const MALE_FORMANTS: Record<string, [number, number, number]> = {
  'a': [700, 1100, 2640],
  'i': [280, 2250, 2950],
  'u': [310, 870,  2350],
  'e': [490, 1870, 2650],
  'o': [450, 800,  2620],
};

/** Карта хираганы → [гласная, тип согласной] */
const KANA_MAP: Record<string, [string, string | null]> = {
  'あ': ['a', null], 'い': ['i', null], 'う': ['u', null],
  'え': ['e', null], 'お': ['o', null],
  'か': ['a', 'k'], 'き': ['i', 'k'], 'く': ['u', 'k'],
  'け': ['e', 'k'], 'こ': ['o', 'k'],
  'さ': ['a', 's'], 'し': ['i', 's'], 'す': ['u', 's'],
  'せ': ['e', 's'], 'そ': ['o', 's'],
  'た': ['a', 't'], 'ち': ['i', 't'], 'つ': ['u', 't'],
  'て': ['e', 't'], 'と': ['o', 't'],
  'な': ['a', 'n'], 'に': ['i', 'n'], 'ぬ': ['u', 'n'],
  'ね': ['e', 'n'], 'の': ['o', 'n'],
  'は': ['a', 'h'], 'ひ': ['i', 'h'], 'ふ': ['u', 'h'],
  'へ': ['e', 'h'], 'ほ': ['o', 'h'],
  'ま': ['a', 'm'], 'み': ['i', 'm'], 'む': ['u', 'm'],
  'め': ['e', 'm'], 'も': ['o', 'm'],
  'や': ['a', 'y'], 'ゆ': ['u', 'y'], 'よ': ['o', 'y'],
  'ら': ['a', 'r'], 'り': ['i', 'r'], 'る': ['u', 'r'],
  'れ': ['e', 'r'], 'ろ': ['o', 'r'],
  'わ': ['a', 'w'], 'を': ['o', 'w'],
  'ん': ['n', null],
};

/** OTO.ini — параметры тайминга для каждого слога */
export const OTO_INI: Record<string, OtoEntry> = {};

// Генерируем OTO записи для всех слогов
for (const kana of Object.keys(KANA_MAP)) {
  const [, consonant] = KANA_MAP[kana];
  const hasConsonant = consonant !== null && consonant !== 'n';
  OTO_INI[kana] = {
    offset:        hasConsonant ? 20 : 10,
    consonant:     hasConsonant ? 80 : 0,
    preutterance:  hasConsonant ? 60 : 10,
    overlap:       hasConsonant ? 40 : 20,
    cutoff:        30,
  };
}

/**
 * Генерирует AudioBuffer для слога на заданной частоте.
 * Использует аддитивный формантный синтез + огибающая ADSR.
 */
export function generateSample(
  ctx: AudioContext,
  kana: string,
  frequency: number,
  durationSec: number
): AudioBuffer {
  const [vowel, consonantType] = KANA_MAP[kana] ?? ['a', null];
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  const formants = MALE_FORMANTS[vowel] ?? MALE_FORMANTS['a'];

  // Согласная часть: шумовой всплеск (80мс)
  const consonantSamples = consonantType ? Math.floor(sampleRate * 0.08) : 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (i < consonantSamples && consonantType) {
      // Шум для согласной
      sample = generateConsonantNoise(consonantType, t, i / consonantSamples);
    } else {
      // Формантный синтез гласной
      const tVowel = (i - consonantSamples) / sampleRate;
      const envelope = adsrEnvelope(tVowel, durationSec - consonantSamples / sampleRate);

      // Суммируем форманты
      for (let h = 1; h <= 12; h++) {
        const harmFreq = frequency * h;
        // Формантные фильтры — усиливаем нужные гармоники
        const amp1 = formantGain(harmFreq, formants[0], 120) * 1.2;
        const amp2 = formantGain(harmFreq, formants[1], 200) * 0.8;
        const amp3 = formantGain(harmFreq, formants[2], 280) * 0.4;
        const amp = (amp1 + amp2 + amp3) / (12 * 0.8);
        sample += amp * Math.sin(2 * Math.PI * harmFreq * tVowel);
      }

      // Добавляем лёгкий джиттер (вибрато голоса)
      const jitter = 1 + 0.003 * Math.sin(2 * Math.PI * 5.5 * tVowel + Math.random() * 0.1);
      sample *= envelope * jitter * 0.7;
    }

    data[i] = Math.max(-1, Math.min(1, sample));
  }

  return buffer;
}

/** ADSR огибающая для гласной */
function adsrEnvelope(t: number, duration: number): number {
  const attack  = 0.015;
  const decay   = 0.04;
  const sustain = 0.75;
  const release = Math.min(0.08, duration * 0.25);
  const releaseStart = duration - release;

  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < releaseStart) return sustain;
  if (t < duration) return sustain * (1 - (t - releaseStart) / release);
  return 0;
}

/** Усиление форманты (гауссова кривая) */
function formantGain(freq: number, center: number, bandwidth: number): number {
  const diff = (freq - center) / bandwidth;
  return Math.exp(-diff * diff * 0.5);
}

/** Шум согласной с характером */
function generateConsonantNoise(type: string, _t: number, progress: number): number {
  const raw = (Math.random() * 2 - 1);
  const envelope = progress < 0.3
    ? progress / 0.3
    : 1 - (progress - 0.3) / 0.7;

  switch (type) {
    case 'k': case 't': return raw * envelope * 0.5;  // взрывные
    case 's': return raw * envelope * 0.3;             // фрикативные
    case 'h': return raw * envelope * 0.2;             // придыхательные
    case 'n': case 'm': return raw * envelope * 0.15;  // назальные
    case 'r': return raw * envelope * 0.1;             // латеральные
    default:  return raw * envelope * 0.2;
  }
}

/** Конвертирует имя ноты в частоту Hz */
export function noteToFrequency(noteName: string): number {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!match) return 440;
  const [, note, octStr] = match;
  const octave = parseInt(octStr);
  const semitone = NOTE_NAMES.indexOf(note);
  if (semitone === -1) return 440;
  // MIDI: C4 = 60, A4 = 440Hz
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
