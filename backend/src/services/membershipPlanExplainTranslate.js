/**
 * Phase 1 — Membership Plans “Explain in …” helper.
 * Display-only: never writes catalog / members / payments.
 * Uses MyMemory public MT (optional email raises free quota).
 */

import { env } from '../config/env.js';

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const CHUNK_MAX = 450;
const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;

/** @type {Map<string, { at: number, text: string }>} */
const memoryCache = new Map();

const LANG_TO_MYMEMORY = {
  hi: 'hi',
  bn: 'bn',
  hinglish: 'hi',
};

/**
 * Compact Devanagari → Latin for Hinglish read-aloud (Phase 1).
 * Keys are Unicode code points / escapes for reliable parsing.
 */
const DEVANAGARI_MAP = {
  '\u0905': 'a',
  '\u0906': 'aa',
  '\u0907': 'i',
  '\u0908': 'ee',
  '\u0909': 'u',
  '\u090A': 'oo',
  '\u090B': 'ri',
  '\u090F': 'e',
  '\u0910': 'ai',
  '\u0913': 'o',
  '\u0914': 'au',
  '\u0902': 'n',
  '\u0903': 'h',
  '\u0901': 'n',
  '\u0915': 'k',
  '\u0916': 'kh',
  '\u0917': 'g',
  '\u0918': 'gh',
  '\u0919': 'ng',
  '\u091A': 'ch',
  '\u091B': 'chh',
  '\u091C': 'j',
  '\u091D': 'jh',
  '\u091E': 'ny',
  '\u091F': 't',
  '\u0920': 'th',
  '\u0921': 'd',
  '\u0922': 'dh',
  '\u0923': 'n',
  '\u0924': 't',
  '\u0925': 'th',
  '\u0926': 'd',
  '\u0927': 'dh',
  '\u0928': 'n',
  '\u092A': 'p',
  '\u092B': 'ph',
  '\u092C': 'b',
  '\u092D': 'bh',
  '\u092E': 'm',
  '\u092F': 'y',
  '\u0930': 'r',
  '\u0932': 'l',
  '\u0935': 'v',
  '\u0936': 'sh',
  '\u0937': 'sh',
  '\u0938': 's',
  '\u0939': 'h',
  '\u0915\u094D\u0937': 'ksh',
  '\u0924\u094D\u0930': 'tr',
  '\u091C\u094D\u091E': 'gy',
  '\u093E': 'a',
  '\u093F': 'i',
  '\u0940': 'ee',
  '\u0941': 'u',
  '\u0942': 'oo',
  '\u0943': 'ri',
  '\u0947': 'e',
  '\u0948': 'ai',
  '\u094B': 'o',
  '\u094C': 'au',
  '\u094D': '',
  '\u093C': '',
  '\u0966': '0',
  '\u0967': '1',
  '\u0968': '2',
  '\u0969': '3',
  '\u096A': '4',
  '\u096B': '5',
  '\u096C': '6',
  '\u096D': '7',
  '\u096E': '8',
  '\u096F': '9',
};

export function normalizeExplainLanguage(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'hi' || v === 'hindi') return 'hi';
  if (v === 'bn' || v === 'bengali' || v === 'bangla') return 'bn';
  if (v === 'hinglish' || v === 'en-hi' || v === 'hi-latn') return 'hinglish';
  if (v === 'en' || v === 'original' || v === 'source') return 'original';
  return '';
}

const CONSONANTS = new Set([
  '\u0915', '\u0916', '\u0917', '\u0918', '\u0919',
  '\u091A', '\u091B', '\u091C', '\u091D', '\u091E',
  '\u091F', '\u0920', '\u0921', '\u0922', '\u0923',
  '\u0924', '\u0925', '\u0926', '\u0927', '\u0928',
  '\u092A', '\u092B', '\u092C', '\u092D', '\u092E',
  '\u092F', '\u0930', '\u0932', '\u0935',
  '\u0936', '\u0937', '\u0938', '\u0939',
]);

const MATRAS = new Set([
  '\u093E', '\u093F', '\u0940', '\u0941', '\u0942', '\u0943',
  '\u0947', '\u0948', '\u094B', '\u094C',
]);

const VIRAMA = '\u094D';

export function romanizeDevanagari(input) {
  const text = String(input || '');
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const digraph = text.slice(i, i + 2);
    if (DEVANAGARI_MAP[digraph] != null && digraph.length === 2 && !CONSONANTS.has(text[i])) {
      out += DEVANAGARI_MAP[digraph];
      i += 1;
      continue;
    }
    // conjuncts like क् + ष
    if (CONSONANTS.has(text[i]) && text[i + 1] === VIRAMA && CONSONANTS.has(text[i + 2])) {
      const cluster = text.slice(i, i + 3);
      if (DEVANAGARI_MAP[cluster] != null) {
        out += DEVANAGARI_MAP[cluster];
        i += 2;
        continue;
      }
    }
    const ch = text[i];
    if (CONSONANTS.has(ch)) {
      out += DEVANAGARI_MAP[ch] || '';
      const next = text[i + 1];
      if (next === VIRAMA) {
        i += 1;
        continue;
      }
      if (!MATRAS.has(next)) out += 'a';
      continue;
    }
    out += DEVANAGARI_MAP[ch] != null ? DEVANAGARI_MAP[ch] : ch;
  }
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

function cacheKey(lang, text) {
  return `${lang}::${text}`;
}

function cacheGet(lang, text) {
  const key = cacheKey(lang, text);
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return hit.text;
}

function cacheSet(lang, text, translated) {
  if (memoryCache.size >= CACHE_MAX) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
  memoryCache.set(cacheKey(lang, text), { at: Date.now(), text: translated });
}

function chunkText(text) {
  const raw = String(text || '');
  if (raw.length <= CHUNK_MAX) return raw ? [raw] : [];
  const parts = [];
  let remaining = raw;
  while (remaining.length > CHUNK_MAX) {
    let cut = remaining.lastIndexOf('\n', CHUNK_MAX);
    if (cut < CHUNK_MAX * 0.4) cut = remaining.lastIndexOf(' ', CHUNK_MAX);
    if (cut < CHUNK_MAX * 0.4) cut = CHUNK_MAX;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

async function mymemoryTranslateChunk(text, targetLang) {
  const q = String(text || '').trim();
  if (!q) return '';
  const cached = cacheGet(targetLang, q);
  if (cached != null) return cached;

  const url = new URL(MYMEMORY_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('langpair', `en|${targetLang}`);
  const email = String(env.MYMEMORY_EMAIL || process.env.MYMEMORY_EMAIL || '').trim();
  if (email) url.searchParams.set('de', email);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Translation service unavailable (${res.status}).`);
    err.status = 502;
    throw err;
  }
  const body = await res.json();
  const translated = String(body?.responseData?.translatedText || '').trim();
  const status = Number(body?.responseStatus || 0);
  if (!translated || (status && status !== 200)) {
    const err = new Error(
      String(body?.responseDetails || 'Could not translate this text. Showing original.'),
    );
    err.status = 502;
    throw err;
  }
  if (/QUERY LENGTH LIMIT|MYMEMORY WARNING|INVALID LANGUAGE/i.test(translated)) {
    const err = new Error(translated);
    err.status = 502;
    throw err;
  }
  cacheSet(targetLang, q, translated);
  return translated;
}

async function translatePlainText(text, targetLang) {
  const chunks = chunkText(text);
  if (!chunks.length) return '';
  const out = [];
  for (const chunk of chunks) {
    out.push(await mymemoryTranslateChunk(chunk, targetLang));
  }
  return out.join('\n\n').trim();
}

/**
 * @param {{ language: string, tagline?: string, details?: string, inclusions?: string[] }} input
 */
export async function translatePlanExplainFields(input) {
  const language = normalizeExplainLanguage(input?.language);
  if (!language || language === 'original') {
    return {
      language: 'original',
      tagline: String(input?.tagline || ''),
      details: String(input?.details || ''),
      inclusions: Array.isArray(input?.inclusions)
        ? input.inclusions.map((s) => String(s || ''))
        : [],
      provider: 'none',
    };
  }

  const mtLang = LANG_TO_MYMEMORY[language];
  if (!mtLang) {
    const err = new Error('Unsupported explain language.');
    err.status = 400;
    throw err;
  }

  const taglineIn = String(input?.tagline || '').trim();
  const detailsIn = String(input?.details || '').trim();
  const inclusionsIn = Array.isArray(input?.inclusions)
    ? input.inclusions.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 40)
    : [];

  const [taglineMt, detailsMt, ...inclusionMt] = await Promise.all([
    taglineIn ? translatePlainText(taglineIn, mtLang) : Promise.resolve(''),
    detailsIn ? translatePlainText(detailsIn, mtLang) : Promise.resolve(''),
    ...inclusionsIn.map((line) => translatePlainText(line, mtLang)),
  ]);

  if (language === 'hinglish') {
    return {
      language,
      tagline: romanizeDevanagari(taglineMt),
      details: romanizeDevanagari(detailsMt),
      inclusions: inclusionMt.map((line) => romanizeDevanagari(line)),
      provider: 'mymemory+romanize',
    };
  }

  return {
    language,
    tagline: taglineMt,
    details: detailsMt,
    inclusions: inclusionMt,
    provider: 'mymemory',
  };
}
