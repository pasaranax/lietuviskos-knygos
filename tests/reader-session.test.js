const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const filename = require('node:path').join(__dirname, '../tgcloud/lib/session.js');
const context = vm.createContext({});
if (fs.existsSync(filename)) vm.runInContext(fs.readFileSync(filename, 'utf8').replace(/export /g, ''), context);

test('token locks the teaching prompt, expires and uses exact stress marks', () => {
  assert.equal(typeof context.createTokenRequest, 'function');
  const result = context.createTokenRequest({ before: 'прочитано', phrase: { text: 'kirčiúota', translation: 'перевод', note: 'разбор' } }, 60, 0);
  assert.equal(result.uses, 1);
  assert.equal(result.expireTime, '1970-01-01T00:01:00.000Z');
  assert.equal(result.newSessionExpireTime, '1970-01-01T00:01:00.000Z');
  assert.equal(result.fieldMask, undefined);
  const setup = result.bidiGenerateContentSetup;
  assert.ok(setup.model.startsWith('models/'));
  const instruction = setup.systemInstruction.parts[0].text;
  assert.ok(instruction.includes('kirčiúota'));
  assert.ok(instruction.includes('разбор'));
  assert.ok(instruction.includes('прочитано'));
  assert.match(instruction, /Не раскрывай/);
  assert.match(instruction, /по аудио/);
  assert.equal(setup.generationConfig.responseModalities[0], 'AUDIO');
});

 test('named teachers select warm Sulafat and steady Charon voices', () => {
  for (const [id, name, voice] of [['egle', 'Eglė', 'Sulafat'], ['marius', 'Marius', 'Charon']]) {
    const setup = context.createTokenRequest({}, 600, 0, id).bidiGenerateContentSetup;
    assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, voice);
    assert.ok(setup.systemInstruction.parts[0].text.includes(name));
  }
});
