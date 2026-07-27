// Carga del contenido estático generado por scripts/build_prototipo.py

const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(path, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar ${path} (${r.status})`);
    return r.json();
  });
  cache.set(path, promise);
  return promise;
}

export const loadCurriculum = () => getJSON('curso/curriculum.json');

export const loadUnit = (n) => getJSON(`curso/unidades/unidad-${String(n).padStart(3, '0')}.json`);

export async function loadUnits(numbers) {
  return Promise.all(numbers.map(loadUnit));
}

let audioIndex = null;
export async function loadAudioIndex() {
  if (audioIndex) return audioIndex;
  try {
    const data = await getJSON('content/audio-index.json');
    audioIndex = new Map();
    for (const entry of data.entries || []) {
      audioIndex.set((entry.text || '').trim().toLowerCase(), entry.audio_path);
    }
  } catch {
    audioIndex = new Map();
  }
  return audioIndex;
}
