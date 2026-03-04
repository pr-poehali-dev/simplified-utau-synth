/**
 * UTAU Voicebank Module
 * Формантный синтез для мужского и женского японского голоса.
 * Полная хирагана (гоjuuon + dakuten + handakuten + combo).
 */

export interface OtoEntry {
  offset: number;       // мс — смещение начала
  consonant: number;    // мс — длина согласной
  preutterance: number; // мс — pre-utterance
  overlap: number;      // мс — crossfade с предыдущей нотой
  cutoff: number;       // мс — хвост гласной
}

export type VoiceGender = 'male' | 'female';

/** Форманты мужского голоса (F1, F2, F3) */
const MALE_FORMANTS: Record<string, [number, number, number]> = {
  a: [700,  1100, 2640],
  i: [280,  2250, 2950],
  u: [310,  870,  2350],
  e: [490,  1870, 2650],
  o: [450,  800,  2620],
  n: [300,  900,  2200],
};

/** Форманты женского голоса (выше F1/F2, более светлый тембр) */
const FEMALE_FORMANTS: Record<string, [number, number, number]> = {
  a: [900,  1300, 3000],
  i: [380,  2700, 3300],
  u: [430,  1200, 2800],
  e: [620,  2200, 3000],
  o: [560,  1000, 2900],
  n: [400,  1100, 2600],
};

/** Полная карта хираганы → [гласная, тип согласной] */
export const KANA_MAP: Record<string, [string, string | null]> = {
  // Гласные
  'あ': ['a', null], 'い': ['i', null], 'う': ['u', null], 'え': ['e', null], 'お': ['o', null],
  // К
  'か': ['a', 'k'], 'き': ['i', 'k'], 'く': ['u', 'k'], 'け': ['e', 'k'], 'こ': ['o', 'k'],
  // С
  'さ': ['a', 's'], 'し': ['i', 's'], 'す': ['u', 's'], 'せ': ['e', 's'], 'そ': ['o', 's'],
  // Т
  'た': ['a', 't'], 'ち': ['i', 't'], 'つ': ['u', 't'], 'て': ['e', 't'], 'と': ['o', 't'],
  // Н
  'な': ['a', 'n'], 'に': ['i', 'n'], 'ぬ': ['u', 'n'], 'ね': ['e', 'n'], 'の': ['o', 'n'],
  // Х
  'は': ['a', 'h'], 'ひ': ['i', 'h'], 'ふ': ['u', 'h'], 'へ': ['e', 'h'], 'ほ': ['o', 'h'],
  // М
  'ま': ['a', 'm'], 'み': ['i', 'm'], 'む': ['u', 'm'], 'め': ['e', 'm'], 'も': ['o', 'm'],
  // Я
  'や': ['a', 'y'], 'ゆ': ['u', 'y'], 'よ': ['o', 'y'],
  // Р
  'ら': ['a', 'r'], 'り': ['i', 'r'], 'る': ['u', 'r'], 'れ': ['e', 'r'], 'ろ': ['o', 'r'],
  // В
  'わ': ['a', 'w'], 'ゐ': ['i', 'w'], 'ゑ': ['e', 'w'], 'を': ['o', 'w'],
  // Н (носовой)
  'ん': ['n', null],
  // Dakuten — звонкие
  'が': ['a', 'g'], 'ぎ': ['i', 'g'], 'ぐ': ['u', 'g'], 'げ': ['e', 'g'], 'ご': ['o', 'g'],
  'ざ': ['a', 'z'], 'じ': ['i', 'z'], 'ず': ['u', 'z'], 'ぜ': ['e', 'z'], 'ぞ': ['o', 'z'],
  'だ': ['a', 'd'], 'ぢ': ['i', 'd'], 'づ': ['u', 'd'], 'で': ['e', 'd'], 'ど': ['o', 'd'],
  'ば': ['a', 'b'], 'び': ['i', 'b'], 'ぶ': ['u', 'b'], 'べ': ['e', 'b'], 'ぼ': ['o', 'b'],
  // Handakuten — п
  'ぱ': ['a', 'p'], 'ぴ': ['i', 'p'], 'ぷ': ['u', 'p'], 'ぺ': ['e', 'p'], 'ぽ': ['o', 'p'],
  // Маленькие (комбо)
  'きゃ': ['a', 'k'], 'きゅ': ['u', 'k'], 'きょ': ['o', 'k'],
  'しゃ': ['a', 's'], 'しゅ': ['u', 's'], 'しょ': ['o', 's'],
  'ちゃ': ['a', 't'], 'ちゅ': ['u', 't'], 'ちょ': ['o', 't'],
  'にゃ': ['a', 'n'], 'にゅ': ['u', 'n'], 'にょ': ['o', 'n'],
  'ひゃ': ['a', 'h'], 'ひゅ': ['u', 'h'], 'ひょ': ['o', 'h'],
  'みゃ': ['a', 'm'], 'みゅ': ['u', 'm'], 'みょ': ['o', 'm'],
  'りゃ': ['a', 'r'], 'りゅ': ['u', 'r'], 'りょ': ['o', 'r'],
  'ぎゃ': ['a', 'g'], 'ぎゅ': ['u', 'g'], 'ぎょ': ['o', 'g'],
  'じゃ': ['a', 'z'], 'じゅ': ['u', 'z'], 'じょ': ['o', 'z'],
  'びゃ': ['a', 'b'], 'びゅ': ['u', 'b'], 'びょ': ['o', 'b'],
  'ぴゃ': ['a', 'p'], 'ぴゅ': ['u', 'p'], 'ぴょ': ['o', 'p'],
};

/** OTO.ini параметры */
export const OTO_INI: Record<string, OtoEntry> = {};

for (const kana of Object.keys(KANA_MAP)) {
  const [, con] = KANA_MAP[kana];
  const hasC = con !== null && con !== 'n';
  OTO_INI[kana] = {
    offset:       hasC ? 20 : 10,
    consonant:    hasC ? 80 : 0,
    preutterance: hasC ? 60 : 10,
    overlap:      hasC ? 40 : 20,
    cutoff:       30,
  };
}

/**
 * Генерирует AudioBuffer для слога.
 * @param gender — 'male' | 'female'
 */
export function generateSample(
  ctx: AudioContext,
  kana: string,
  frequency: number,
  durationSec: number,
  gender: VoiceGender = 'male'
): AudioBuffer {
  const [vowel, consonantType] = KANA_MAP[kana] ?? ['a', null];
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, Math.max(1, totalSamples), sampleRate);
  const data = buffer.getChannelData(0);

  const formantTable = gender === 'female' ? FEMALE_FORMANTS : MALE_FORMANTS;
  const formants = formantTable[vowel] ?? formantTable['a'];

  // Женский голос — основной тон выше на октаву–1.5
  const baseFreq = gender === 'female' ? frequency * 1.4 : frequency;

  const consonantSamples = consonantType ? Math.floor(sampleRate * 0.075) : 0;

  for (let i = 0; i < totalSamples; i++) {
    let sample = 0;

    if (i < consonantSamples && consonantType) {
      const progress = i / consonantSamples;
      sample = generateConsonantNoise(consonantType, progress, gender);
    } else {
      const tVowel = (i - consonantSamples) / sampleRate;
      const dur = Math.max(0.01, durationSec - consonantSamples / sampleRate);
      const env = adsrEnvelope(tVowel, dur);

      // Аддитивный формантный синтез
      const harmonics = gender === 'female' ? 10 : 14;
      for (let h = 1; h <= harmonics; h++) {
        const hf = baseFreq * h;
        if (hf > sampleRate / 2) break;
        const a1 = formantGain(hf, formants[0], gender === 'female' ? 150 : 120) * 1.2;
        const a2 = formantGain(hf, formants[1], gender === 'female' ? 250 : 200) * 0.85;
        const a3 = formantGain(hf, formants[2], gender === 'female' ? 320 : 280) * 0.4;
        const amp = (a1 + a2 + a3) / (harmonics * 0.8);
        sample += amp * Math.sin(2 * Math.PI * hf * tVowel);
      }

      // Вибрато
      const vibRate = gender === 'female' ? 5.8 : 5.2;
      const vibDepth = gender === 'female' ? 0.004 : 0.003;
      const vib = 1 + vibDepth * Math.sin(2 * Math.PI * vibRate * tVowel);
      sample *= env * vib * 0.65;
    }

    data[i] = Math.max(-1, Math.min(1, sample));
  }

  return buffer;
}

function adsrEnvelope(t: number, duration: number): number {
  const attack  = 0.012;
  const decay   = 0.04;
  const sustain = 0.78;
  const release = Math.min(0.07, duration * 0.22);
  const rs = Math.max(0, duration - release);
  if (t < attack)         return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < rs)             return sustain;
  if (t < duration)       return sustain * (1 - (t - rs) / release);
  return 0;
}

function formantGain(freq: number, center: number, bw: number): number {
  const d = (freq - center) / bw;
  return Math.exp(-d * d * 0.5);
}

function generateConsonantNoise(type: string, progress: number, gender: VoiceGender): number {
  const raw = Math.random() * 2 - 1;
  const env = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
  const scale = gender === 'female' ? 0.85 : 1;
  switch (type) {
    case 'k': case 't': case 'p': return raw * env * 0.45 * scale;
    case 'g': case 'd': case 'b': return raw * env * 0.35 * scale;
    case 's': case 'z':           return raw * env * 0.28 * scale;
    case 'h':                     return raw * env * 0.18 * scale;
    case 'n': case 'm':           return raw * env * 0.14 * scale;
    case 'r': case 'w': case 'y': return raw * env * 0.10 * scale;
    default:                      return raw * env * 0.18 * scale;
  }
}

/** Имя ноты → частота Hz */
export function noteToFrequency(noteName: string): number {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!m) return 440;
  const semi = NAMES.indexOf(m[1]);
  if (semi === -1) return 440;
  const midi = (parseInt(m[2]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Все строки хираганы для отображения в UI */
export const HIRAGANA_ROWS: { label: string; kana: string[] }[] = [
  { label: 'Vowels',     kana: ['あ','い','う','え','お'] },
  { label: 'K',          kana: ['か','き','く','け','こ'] },
  { label: 'S',          kana: ['さ','し','す','せ','そ'] },
  { label: 'T',          kana: ['た','ち','つ','て','と'] },
  { label: 'N',          kana: ['な','に','ぬ','ね','の'] },
  { label: 'H',          kana: ['は','ひ','ふ','へ','ほ'] },
  { label: 'M',          kana: ['ま','み','む','め','も'] },
  { label: 'Y',          kana: ['や','ゆ','よ'] },
  { label: 'R',          kana: ['ら','り','る','れ','ろ'] },
  { label: 'W',          kana: ['わ','を','ん'] },
  { label: 'G (voiced)', kana: ['が','ぎ','ぐ','げ','ご'] },
  { label: 'Z (voiced)', kana: ['ざ','じ','ず','ぜ','ぞ'] },
  { label: 'D (voiced)', kana: ['だ','ぢ','づ','で','ど'] },
  { label: 'B (voiced)', kana: ['ば','び','ぶ','べ','ぼ'] },
  { label: 'P (semi)',   kana: ['ぱ','ぴ','ぷ','ぺ','ぽ'] },
  { label: 'Combos KY',  kana: ['きゃ','きゅ','きょ'] },
  { label: 'Combos SH',  kana: ['しゃ','しゅ','しょ'] },
  { label: 'Combos CH',  kana: ['ちゃ','ちゅ','ちょ'] },
  { label: 'Combos NY',  kana: ['にゃ','にゅ','にょ'] },
  { label: 'Combos HY',  kana: ['ひゃ','ひゅ','ひょ'] },
  { label: 'Combos MY',  kana: ['みゃ','みゅ','みょ'] },
  { label: 'Combos RY',  kana: ['りゃ','りゅ','りょ'] },
];
