// Runs in an AudioContext created at 16 kHz, so the browser has already resampled the mic.
// Emits 80 ms frames (1280 samples) of little-endian PCM16 plus an RMS level for the meter.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(1280);
    this.n = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.sumSq += s * s;
      if (this.n === this.buf.length) {
        const level = Math.sqrt(this.sumSq / this.n);
        this.port.postMessage({ pcm: this.buf.buffer, level }, [this.buf.buffer]);
        this.buf = new Int16Array(1280);
        this.n = 0;
        this.sumSq = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
