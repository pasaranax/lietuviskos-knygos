export const defaultSettings = { fontSize: 23, fontFamily: 'serif', theme: 'light', language: 'lt', voice: 'egle' };
export function validSettings(input) {
  if (!input || !Number.isInteger(input.fontSize) || input.fontSize < 18 || input.fontSize > 32 ||
      !['serif', 'sans'].includes(input.fontFamily) || !['light', 'dark'].includes(input.theme) ||
      !['lt', 'ru'].includes(input.language) || !['egle', 'marius'].includes(input.voice)) throw new Error('Invalid settings');
  return Object.fromEntries(Object.keys(defaultSettings).map(key => [key, input[key]]));
}
export async function getSettings(db, userId) {
  const row = await db.get('SELECT settings FROM reader_profiles WHERE user_id = :userId', { ':userId': userId });
  return row ? validSettings(JSON.parse(row.settings)) : { ...defaultSettings };
}
