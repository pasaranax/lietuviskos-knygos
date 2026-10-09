(function () {
  'use strict';
  function endpoint(name, input) {
    return new Promise(function (resolve, reject) {
      var app = window.Telegram && window.Telegram.WebApp;
      if (!app || !app.initData || !app.Serverless) {
        reject(new Error('Открой голосового помощника в Telegram.'));
        return;
      }
      var timer = setTimeout(function () { reject(new Error('Слишком долгое подключение. Попробуй ещё раз.')); }, 20000);
      app.Serverless.call(name, input, function (error, result) {
        clearTimeout(timer);
        if (error) reject(new Error(error.message || 'Не удалось подключиться.'));
        else resolve(result);
      });
    });
  }

  function ReaderVoice(options) {
    this.onState = options.onState || function () {};
    this.onLevel = options.onLevel || function () {};
    this.onError = options.onError || function () {};
    this.onPlaySelected = options.onPlaySelected || function () { throw new Error("Выбери фразу с записью."); };
    this.active = false;
    this.call = null;
    this.usageCalls = [];
    var app = window.Telegram && window.Telegram.WebApp;
    var userId = app && app.initDataUnsafe && app.initDataUnsafe.user && app.initDataUnsafe.user.id;
    this.usageKey = app && app.initData && Number.isSafeInteger(userId) ? 'readerVoiceUsage.' + userId : null;
    try {
      var outbox = this.usageKey && JSON.parse(window.localStorage.getItem(this.usageKey) || '[]');
      if (Array.isArray(outbox)) outbox.forEach(function (entry) {
        if (!/^[a-f0-9]{32}$/.test(entry.callId) || !Array.isArray(entry.events) || !entry.events.length) return;
        var call = { session: { callId: entry.callId }, usageEvents: entry.events, closed: true };
        this.usageCalls.push(call); this.flushUsage(call);
      }, this);
    } catch (_) {}
  }

  // Same 100 ms speech gate as Voisya: keep onset, discard quiet noise/clicks.
  function MicGate() { this.reset(); }
  MicGate.prototype.reset = function () { this.buffer = []; this.voiced = this.tail = 0; };
  MicGate.prototype.push = function (chunk, rms) {
    var loud = rms >= .006;
    this.voiced = loud ? this.voiced + 1 : 0;
    if (this.tail) {
      this.tail = loud ? 5 : this.tail - 1;
      return [chunk];
    }
    this.buffer.push(chunk);
    if (this.buffer.length > 3) this.buffer.shift();
    if (this.voiced < 2) return [];
    var chunks = this.buffer;
    this.buffer = []; this.tail = 5;
    return chunks;
  };

  ReaderVoice.prototype.start = async function (input) {
    this.stop();
    var self = this;
    var app = window.Telegram && window.Telegram.WebApp;
    if (!app || !app.initData || !app.Serverless) {
      this.onError('Открой голосового помощника в Telegram.');
      return;
    }
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.onError('Этот браузер не поддерживает голосовой разговор.');
      return;
    }
    var call = { closed: false, ready: false, sources: new Set(), cursor: 0, bookId: input.bookId, location: input.location, cancelledTools: new Set() };
    this.call = call;
    try {
      // Resume audio in the original button gesture, including iOS.
      call.audio = new Context();
      await call.audio.resume();
      if (call.closed) return;
      var status = await endpoint('readerCallStatus', {});
      if (call.closed) return;
      if (!status.allowed) throw new Error(status.message || 'На сегодня 10 минут голосового помощника закончились. Возвращайся завтра.');
      this.active = true;
      this.onState('connecting');
      call.gate = new MicGate();
      call.silentFrame = btoa('\0'.repeat(3200));
      var stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false
      } });
      if (call.closed) { stream.getTracks().forEach(function (track) { track.stop(); }); return; }
      call.stream = stream;
      await call.audio.audioWorklet.addModule('reader-mic-worklet.js');
      if (call.closed) return;
      if (call.audio.createAnalyser) {
        call.outputMeter = call.audio.createAnalyser();
        call.outputMeter.fftSize = 512;
        call.outputMeter.connect(call.audio.destination);
        var meterSamples = new Float32Array(call.outputMeter.fftSize);
        call.meterTimer = setInterval(function () {
          call.outputMeter.getFloatTimeDomainData(meterSamples);
          var sum = 0;
          for (var i = 0; i < meterSamples.length; i++) sum += meterSamples[i] * meterSamples[i];
          self.meterActivity(call, call.inputLevel || 0, Math.sqrt(sum / meterSamples.length));
        }, 50);
      }
      call.input = call.audio.createMediaStreamSource(stream);
      call.worklet = new AudioWorkletNode(call.audio, 'reader-mic');
      call.silent = call.audio.createGain();
      call.silent.gain.value = 0;
      call.worklet.port.onmessage = function (event) {
        if (call.closed || !call.ready) return;
        if (call.reference) { call.inputLevel = 0; return; }
        var samples = new Int16Array(event.data);
        var sum = 0;
        for (var i = 0; i < samples.length; i++) sum += Math.pow(samples[i] / 32768, 2);
        var micReady = call.greetingDone && call.audio.currentTime >= (call.micResumeAt || 0);
        call.inputLevel = micReady ? Math.sqrt(sum / samples.length) : 0;
        if (!call.outputMeter) self.meterActivity(call, call.inputLevel, 0);
        var bytes = new Uint8Array(event.data), binary = '';
        for (var b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b]);
        var chunks = micReady ? call.gate.push(btoa(binary), call.inputLevel) : [];
        if (!chunks.length) chunks = [call.silentFrame];
        if (call.socket.readyState === 1) chunks.forEach(function (chunk) {
          call.socket.send(JSON.stringify({ realtimeInput: { audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' } } }));
        });
      };
      call.input.connect(call.worklet);
      call.worklet.connect(call.silent);
      call.silent.connect(call.audio.destination);
      call.session = await endpoint('startReaderCall', input);
      if (call.closed) { self.release(call); return; }
      if (typeof call.session.token !== 'string' || !/^[a-f0-9]{32}$/.test(call.session.callId || '')
        || typeof call.session.model !== 'string' || !Number.isFinite(call.session.maxCallSeconds)) throw new Error('Не удалось начать разговор.');
      await this.connect(call);
    } catch (error) {
      if (call.closed) return;
      this.stop();
      this.onError(error.name === 'NotAllowedError' ? 'Разреши доступ к микрофону и попробуй ещё раз.' : (error.message || 'Не удалось подключиться.'));
    }
  };

  ReaderVoice.prototype.connect = function (call) {
    var self = this;
    return new Promise(function (resolve, reject) {
      call.rejectConnect = reject;
      call.connectTimer = setTimeout(function () { reject(new Error('Слишком долгое подключение. Попробуй ещё раз.')); }, 20000);
      call.socket = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(call.session.token));
      call.socket.binaryType = 'arraybuffer';
      call.socket.onopen = function () {
        if (call.closed) return;
        call.socket.send(JSON.stringify({ setup: { model: 'models/' + call.session.model,
          generationConfig: { responseModalities: ['AUDIO'] } } }));
      };
      call.socket.onmessage = async function (event) {
        if (call.closed) return;
        try {
          var data = event.data;
          var message = JSON.parse(typeof data === 'string' ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : await data.text());
          if (call.closed) return;
          if (message.error) throw new Error('Не удалось подключиться. Попробуй ещё раз.');
          if (message.setupComplete && !call.ready) {
            var grant = await endpoint('readerCallTime', { callId: call.session.callId, action: 'start' });
            if (call.closed) return;
            call.ready = true;
            self.cue('start', call.audio);
            clearTimeout(call.connectTimer);
            self.onState('listening');
            call.endTimer = setTimeout(function () { self.stop(); self.onError('Время разговора закончилось.'); }, grant.remainingSeconds * 1000);
            call.heartbeat = setInterval(function () {
              if (call.checking || call.closed) return;
              call.checking = true;
              endpoint('readerCallTime', { callId: call.session.callId, action: 'heartbeat' })
                .catch(function (error) { if (!call.closed) { self.stop(); self.onError(error.message || 'Связь прервалась. Попробуй ещё раз.'); } })
                .finally(function () { call.checking = false; });
            }, 10000);
            call.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [
              { text: 'Соединение установлено. Поздоровайся согласно своей инструкции и жди моего вопроса.' }
            ] }], turnComplete: true } }));
            resolve();
          }
          if (message.usageMetadata) self.recordUsage(call, message.usageMetadata);
          if (message.toolCallCancellation) (message.toolCallCancellation.ids || []).forEach(function (id) {
            call.cancelledTools.add(id);
            if (call.reference && call.reference.toolId === id) self.stopReference();
          });
          if (message.toolCall) self.handleTools(call, message.toolCall.functionCalls || []);
          var content = message.serverContent;
          if (!content) return;
          if (content.interrupted) self.interrupt(call);
          var parts = content.modelTurn && content.modelTurn.parts || [];
          parts.forEach(function (part) {
            if (part.inlineData && /^audio\/pcm/.test(part.inlineData.mimeType)) {
              var rate = /rate=(\d+)/.exec(part.inlineData.mimeType);
              self.play(call, part.inlineData.data, rate ? Number(rate[1]) : 24000);
            }
          });
          if (content.turnComplete) { call.greetingTurnComplete = true; self.releaseGreeting(call); }
        } catch (error) {
          if (!call.ready) reject(error);
          else if (!call.closed) { self.stop(); self.onError(error.message || 'Связь прервалась.'); }
        }
      };
      call.socket.onerror = call.socket.onclose = function () {
        if (call.closed) return;
        var error = new Error('Разговор завершён. Можно подключиться снова.');
        if (!call.ready) reject(error);
        else { self.stop(); self.onError(error.message); }
      };
    });
  };

  ReaderVoice.prototype.play = function (call, base64, rate) {
    if (call.closed || call.reference) return;
    var binary = atob(base64);
    if (binary.length % 2) throw new Error('Неверный формат аудио.');
    var samples = new Float32Array(binary.length / 2), sum = 0;
    for (var i = 0; i < samples.length; i++) {
      var value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      samples[i] = (value >= 32768 ? value - 65536 : value) / 32768;
      sum += samples[i] * samples[i];
    }
    if (!samples.length) return;
    var buffer = call.audio.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    var source = call.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(call.outputMeter || call.audio.destination);
    var start = Math.max(call.cursor, call.audio.currentTime);
    call.cursor = start + buffer.duration;
    call.sources.add(source);
    call.firstVoice = true;
    var self = this;
    source.onended = function () {
      call.sources.delete(source);
      self.releaseGreeting(call);
      if (!call.closed && !call.sources.size) { self.meterActivity(call, call.inputLevel || 0, 0); }
    };
    source.start(start);
    if (!call.outputMeter) this.meterActivity(call, 0, Math.sqrt(sum / samples.length));
  };

  ReaderVoice.prototype.releaseGreeting = function (call) {
    if (call.closed || call.greetingDone || !call.firstVoice || !call.greetingTurnComplete || call.sources.size) return;
    call.greetingDone = true;
    call.gate.reset();
    call.inputLevel = 0;
    if (call.pendingContext) {
      var context = call.pendingContext; call.pendingContext = null;
      this.updateContext(context);
    }
  };

  ReaderVoice.prototype.referencePlaying = function () {
    return !!(this.call && this.call.reference);
  };

  ReaderVoice.prototype.stopReference = function () {
    var reference = this.call && this.call.reference;
    if (reference) reference.finish(new DOMException('Cancelled', 'AbortError'));
  };

  // Decode once at 16 kHz: the same buffer reaches the speaker and Gemini.
  // No microphone capture of the speaker, no new call or media-element binding.
  ReaderVoice.prototype.playReference = function (url, phrase) {
    this.stopReference();
    var self = this, call = this.call;
    if (!call || call.closed || !call.ready) return Promise.reject(new Error('Дождись подключения помощника.'));
    if (!call.greetingDone) return Promise.reject(new Error('Дождись окончания приветствия и нажми «Прослушать» ещё раз.'));
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.reject(new Error('Этот браузер не поддерживает передачу записи.'));
    var reference = { controller: new AbortController(), finished: false, started: false };
    call.reference = reference;
    call.gate.reset(); call.inputLevel = 0;
    this.interrupt(call);
    return new Promise(function (resolve, reject) {
      reference.finish = function (error) {
        if (reference.finished) return;
        reference.finished = true;
        clearTimeout(reference.loadTimer); clearInterval(reference.timer);
        reference.controller.abort();
        if (reference.source) {
          reference.source.onended = null;
          try { reference.source.stop(); } catch (_) {}
          reference.source.disconnect();
        }
        if (call.reference === reference) call.reference = null;
        call.gate.reset(); call.inputLevel = 0;
        // Let the speaker tail fade before accepting microphone frames again.
        call.micResumeAt = call.audio.currentTime + .35;
        if (reference.started && !call.closed && call.socket.readyState === 1) {
          call.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{
            text: 'reference_audio_end: ' + (error ? 'Запись остановлена. Жди моего вопроса.' : 'Эталонная запись завершена. Можешь коротко предложить разбор грамматики или слов по текущему разговору либо молча ждать. Практику произношения продолжай только по просьбе пользователя.') + ' Это не попытка ученика.'
          }] }], turnComplete: !error && !reference.toolId } }));
        }
        if (error) reject(error); else resolve();
      };
      reference.loadTimer = setTimeout(function () { reference.finish(new Error('Не удалось загрузить запись. Попробуй ещё раз.')); }, 20000);
      (async function () {
        await call.audio.resume();
        if (reference.finished || call.closed) return;
        var response = await fetch(url, { signal: reference.controller.signal });
        if (!response.ok) throw new Error('Не удалось загрузить запись.');
        var bytes = await response.arrayBuffer();
        if (reference.finished || call.closed) return;
        var buffer = await new Offline(1, 1, 16000).decodeAudioData(bytes);
        if (reference.finished || call.closed) return;
        if (buffer.sampleRate !== 16000 || !buffer.length) throw new Error('Не удалось прочитать запись.');
        clearTimeout(reference.loadTimer);
        var channels = [];
        for (var c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        var sent = 0, start = call.audio.currentTime;
        function pump(final) {
          if (reference.finished || call.closed || call.socket.readyState !== 1) return;
          var limit = final ? buffer.length : Math.min(buffer.length, Math.floor((call.audio.currentTime - start) * 16000));
          while (sent < limit) {
            var length = Math.min(1600, limit - sent);
            if (!final && length < 1600) break;
            var pcm = new DataView(new ArrayBuffer(length * 2)), binary = '';
            for (var i = 0; i < length; i++) {
              var value = 0;
              for (var c = 0; c < channels.length; c++) value += channels[c][sent + i] / channels.length;
              value = Math.max(-1, Math.min(1, value));
              pcm.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
            }
            var bytes = new Uint8Array(pcm.buffer);
            for (var b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b]);
            call.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ inlineData: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' } }] }], turnComplete: false } }));
            sent += length;
          }
        }
        call.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{
          text: 'reference_audio_start: ' + JSON.stringify(phrase) + '\nСейчас звучит эталон через «Прослушать», не речь ученика. Слушай молча; не оценивай это как его произношение.'
        }] }], turnComplete: false } }));
        reference.started = true;
        reference.source = call.audio.createBufferSource();
        reference.source.buffer = buffer;
        reference.source.connect(call.audio.destination);
        reference.source.onended = function () { pump(true); reference.finish(); };
        reference.source.start(start);
        reference.timer = setInterval(function () { pump(false); }, 25);
      })().catch(function (error) { reference.finish(error); });
    });
  };

  ReaderVoice.prototype.meterActivity = function (call, inputRms, outputRms) {
    if (call.closed || !call.ready) return;
    var speaker = inputRms > .015 ? 'user' : outputRms > .008 ? 'assistant' : null;
    var status = speaker === 'user' ? 'user-speaking' : speaker === 'assistant' ? 'speaking' : 'listening';
    if (call.visualState !== status) { call.visualState = status; this.onState(status); }
    this.onLevel(speaker ? Math.min(1, (speaker === 'user' ? inputRms : outputRms) * 5) : 0, speaker);
  };

  ReaderVoice.prototype.interrupt = function (call) {
    call.sources.forEach(function (source) { source.onended = null; try { source.stop(); } catch (_) {} });
    call.sources.clear();
    call.cursor = call.audio ? call.audio.currentTime : 0;
    if (!call.closed) this.onState('listening');
    this.onLevel(0);
  };

  ReaderVoice.prototype.release = function (call) {
    if (call.session && !call.released) {
      call.released = true;
      endpoint('readerCallTime', { callId: call.session.callId, action: 'end' }).catch(function () {});
    }
  };

  ReaderVoice.prototype.updateContext = function (context, location) {
    var call = this.call;
    if (!call || call.closed) return;
    if (location) call.location = location;
    if (!call.ready || !call.greetingDone) { call.pendingContext = context; return; }
    this.stopReference();
    this.interrupt(call);
    call.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{
      text: 'reading_update: ' + JSON.stringify(context)
    }] }], turnComplete: false } }));
  };

  ReaderVoice.prototype.storeUsageOutbox = function () {
    try { if (this.usageKey) window.localStorage.setItem(this.usageKey, JSON.stringify(this.usageCalls.map(function (call) {
      return { callId: call.session.callId, events: call.usageEvents };
    }))); } catch (_) {}
  };

  ReaderVoice.prototype.recordUsage = function (call, metadata) {
    if (!call.usageEvents) { call.usageEvents = []; call.usageSequence = 0; }
    call.usageEvents.push({ sequence: ++call.usageSequence, receivedAt: Date.now(), metadata: metadata });
    if (this.usageCalls.indexOf(call) < 0) this.usageCalls.push(call);
    this.storeUsageOutbox();
    this.flushUsage(call);
  };

  ReaderVoice.prototype.flushUsage = function (call) {
    if (call.usageSaving || !call.usageEvents || !call.usageEvents.length) return;
    var self = this, batch = call.usageEvents.slice(0, 20);
    call.usageSaving = true;
    endpoint('readerCallUsage', { callId: call.session.callId, events: batch }).then(function () {
      call.usageEvents.splice(0, batch.length); call.usageRetries = 0;
    }).catch(function () { call.usageRetries = (call.usageRetries || 0) + 1; }).finally(function () {
      call.usageSaving = false;
      if (!call.usageEvents.length) self.usageCalls = self.usageCalls.filter(function (entry) { return entry !== call; });
      self.storeUsageOutbox();
      if (call.usageEvents.length) call.usageRetry = setTimeout(function () { self.flushUsage(call); }, Math.min(30000, (call.usageRetries || 0) * 2000));
    });
  };

  ReaderVoice.prototype.handleTools = async function (call, functions) {
    var responses = [];
    for (var fn of functions) {
      if (call.closed || call.cancelledTools.has(fn.id)) continue;
      var response;
      try {
        if (fn.name === 'play_selected_phrase') {
          if (!call.greetingDone) throw new Error('Greeting not finished');
          var playback = this.onPlaySelected();
          if (call.reference) call.reference.toolId = fn.id;
          await playback;
          response = { status: 'completed', message: 'Эталонная запись завершена. Предложи разбор грамматики или слов по текущему разговору либо жди. Практику произношения продолжай только по просьбе пользователя; это не попытка ученика.' };
        } else {
        if (fn.name !== 'get_book_history') throw new Error('Unknown tool');
        var history = await endpoint('readerBookHistory', { bookId: call.bookId, location: call.location });
        // A user can move backwards while the request is in flight.
        response = { chapters: (history.chapters || []).filter(function (chapter) {
          return call.location && chapter.chapter < call.location.chapter - 1;
        }) };
        }
      } catch (error) { response = { error: fn.name === 'play_selected_phrase' ? (error.name === 'AbortError' ? 'Воспроизведение остановлено. Жди нового вопроса; не запускай запись повторно.' : 'Не удалось воспроизвести выбранную фразу. Попроси выбрать фразу и попробовать «Прослушать».') : 'Не удалось получить сводку. Не придумывай более ранние события.' }; }
      if (call.closed || call.cancelledTools.has(fn.id)) continue;
      responses.push({ id: fn.id, name: fn.name, response: response });
    }
    responses = responses.filter(function (response) { return !call.cancelledTools.has(response.id); });
    // Other tools may have awaited playback after the history request completed.
    responses.forEach(function (response) {
      if (response.name === 'get_book_history' && response.response.chapters) {
        response.response.chapters = response.response.chapters.filter(function (chapter) {
          return call.location && chapter.chapter < call.location.chapter - 1;
        });
      }
    });
    if (!call.closed && responses.length && call.socket.readyState === 1) {
      call.socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    }
  };

  ReaderVoice.prototype.cue = function (type, audio) {
    if (!audio || !audio.createOscillator || audio.state === 'closed') return 0;
    var notes = type === 'start' ? [523.25, 783.99] : [783.99, 523.25];
    var now = audio.currentTime;
    notes.forEach(function (frequency, index) {
      var start = now + index * .12;
      var oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.045, start + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = function () { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + .17);
    });
    return 320;
  };

  ReaderVoice.prototype.stop = function () {
    var call = this.call;
    if (call) { call.closed = true; this.stopReference(); }
    this.call = null;
    this.active = false;
    if (call) {
      call.closed = true;
      clearTimeout(call.connectTimer); clearTimeout(call.endTimer); clearInterval(call.heartbeat); clearInterval(call.meterTimer);
      if (call.rejectConnect) call.rejectConnect(new DOMException('Cancelled', 'AbortError'));
      if (call.socket) call.socket.close();
      if (call.stream) call.stream.getTracks().forEach(function (track) { track.stop(); });
      if (call.worklet) { call.worklet.port.onmessage = null; call.worklet.disconnect(); }
      if (call.input) call.input.disconnect();
      if (call.silent) call.silent.disconnect();
      if (call.outputMeter) call.outputMeter.disconnect();
      this.interrupt(call);
      if (call.audio && call.audio.state !== 'closed') {
        var cueMs = call.ready ? this.cue('end', call.audio) : 0;
        if (cueMs) setTimeout(function () { call.audio.close().catch(function () {}); }, cueMs);
        else call.audio.close().catch(function () {});
      }
      this.flushUsage(call);
      this.release(call);
    }
    this.onLevel(0);
    this.onState('idle');
  };
  window.ReaderVoice = ReaderVoice;
})();
