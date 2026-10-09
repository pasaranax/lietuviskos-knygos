class ReaderMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Int16Array(1600);
    this.index = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    // Average device samples into 16kHz mono PCM; phase persists across blocks.
    for (const sample of samples) {
      this.sum += sample;
      this.count++;
      this.phase += 16000;
      while (this.phase >= sampleRate) {
        const value = Math.max(-1, Math.min(1, this.count ? this.sum / this.count : sample));
        this.chunk[this.index++] = Math.round(value * (value < 0 ? 32768 : 32767));
        this.phase -= sampleRate;
        this.sum = 0;
        this.count = 0;
        if (this.index === this.chunk.length) {
          this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
          this.chunk = new Int16Array(1600);
          this.index = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('reader-mic', ReaderMic);
