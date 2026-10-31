// Leaves a phone's own voice out of the computer sound sent back to it.
//
// Input 0 is the computer's sound as captured from the speakers' mix
// ("loopback"), which includes the phone's voice as Ayva plays it. Input 1 is
// that voice itself, as received. The path between them is digital (no room,
// no microphone), so the voice reaches the capture as a delayed, scaled copy:
//   1. find the delay by cross-correlating the two (on a decimated, whitened
//      copy), spread over many audio blocks so playback never stalls, and
//   2. at that delay, a short NLMS filter learns the exact gain and timing and
//      subtracts the copy, leaving everything else (other people, music) as is.
// Until a delay is found the sound passes through unchanged.

const DECIMATE = 8;          // delay search runs at 6 kHz
const HISTORY = 8192;        // decimated samples kept (~1.4 s), a power of two
const SEARCH_EVERY = 3000;   // decimated samples between searches (0.5 s)
const WINDOW = 3000;         // decimated samples compared per search (0.5 s)
const MAX_LAG = 2400;        // longest delay looked for (0.4 s)
const LAGS_PER_BLOCK = 80;   // search work per 128-sample block
const PEAK = 6;              // a match must stand this many deviations above the rest
const REF_SIZE = 32768;      // full-rate voice history (~0.68 s), a power of two
const TAPS = 32;             // filter length around the found delay
const LEAD = 12;             // taps before the delay (the search is exact to ±8 samples)
const MU_FAST = 0.05;        // adaptation step just after the delay is found…
const MU_FINE = 0.01;        // …and later, when other sounds would only shake it
const FAST_FOR = 96000;      // samples of fast learning (2 s)

const H = HISTORY - 1;
const R = REF_SIZE - 1;

class EchoCut extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ref = new Float32Array(REF_SIZE);
    this.t = 0; // full-rate samples seen
    this.decRef = new Float32Array(HISTORY);
    this.decCap = new Float32Array(HISTORY);
    this.dt = 0; // decimated samples seen
    this.accRef = 0;
    this.accCap = 0;
    this.sinceSearch = 0;
    this.delay = -1;
    this.lockedAt = 0;
    this.candidate = -1;
    this.w = [new Float32Array(TAPS), new Float32Array(TAPS)];
    this.x = new Float32Array(TAPS);
    this.level = 0; // recent power of the captured sound
    // A search in progress.
    this.capWin = new Float32Array(WINDOW);
    this.refSeg = new Float32Array(WINDOW + MAX_LAG);
    this.capPow = 0;
    this.nextLag = -1; // -1: no search running
    this.best = -1;
    this.bestScore = 0;
    this.sum = 0;
    this.sumSq = 0;
    this.count = 0;
  }

  // Snapshot of the last WINDOW decimated samples, as first differences
  // (whitened: low hums and music tones stop dominating the match).
  startSearch() {
    const now = this.dt;
    this.capPow = 0;
    for (let n = 0; n < WINDOW; n++) {
      const i = now - WINDOW + n;
      const c = this.decCap[i & H] - this.decCap[(i - 1) & H];
      this.capWin[n] = c;
      this.capPow += c * c;
    }
    for (let m = 0; m < WINDOW + MAX_LAG; m++) {
      const i = now - WINDOW - MAX_LAG + m;
      this.refSeg[m] = this.decRef[i & H] - this.decRef[(i - 1) & H];
    }
    this.best = -1;
    this.bestScore = 0;
    this.sum = 0;
    this.sumSq = 0;
    this.count = 0;
    this.nextLag = this.capPow < 1e-9 ? -1 : 0;
    if (this.nextLag < 0) this.candidate = -1;
  }

  continueSearch() {
    const last = Math.min(MAX_LAG, this.nextLag + LAGS_PER_BLOCK - 1);
    const cap = this.capWin;
    const ref = this.refSeg;
    for (let k = this.nextLag; k <= last; k++) {
      let dot = 0;
      let refPow = 0;
      const base = MAX_LAG - k;
      for (let n = 0; n < WINDOW; n++) {
        const r = ref[base + n];
        dot += cap[n] * r;
        refPow += r * r;
      }
      if (refPow < 1e-9) continue;
      const score = dot / Math.sqrt(refPow * this.capPow);
      this.sum += score;
      this.sumSq += score * score;
      this.count++;
      if (score > this.bestScore) {
        this.bestScore = score;
        this.best = k;
      }
    }
    this.nextLag = last + 1;
    if (this.nextLag <= MAX_LAG) return;
    this.nextLag = -1;

    let lag = -1;
    if (this.count > 100) {
      const mean = this.sum / this.count;
      const sd = Math.sqrt(Math.max(0, this.sumSq / this.count - mean * mean));
      if (this.bestScore > mean + PEAK * sd) lag = this.best;
    }
    // Trust a delay once two searches in a row agree.
    if (lag >= 0 && this.candidate >= 0 && Math.abs(lag - this.candidate) <= 1) {
      const delay = lag * DECIMATE;
      if (this.delay < 0 || Math.abs(delay - this.delay) > LEAD / 2) {
        this.delay = delay;
        this.lockedAt = this.t;
        this.w[0].fill(0);
        this.w[1].fill(0);
      }
    }
    if (lag >= 0) this.candidate = lag;
  }

  process(inputs, outputs) {
    const cap = inputs[0];
    const voice = inputs[1];
    const out = outputs[0];
    const frames = out[0].length;
    const channels = Math.min(out.length, 2);
    const x = this.x;
    for (let i = 0; i < frames; i++) {
      // The voice, mixed to mono.
      let r = 0;
      if (voice && voice.length) {
        for (let c = 0; c < voice.length; c++) r += voice[c][i];
        r /= voice.length;
      }
      this.ref[this.t & R] = r;

      // The voice around the found delay, shared by both channels.
      let pow = 0;
      if (this.delay >= 0) {
        const start = this.t - this.delay + LEAD;
        for (let j = 0; j < TAPS; j++) {
          const v = this.ref[(start - j) & R];
          x[j] = v;
          pow += v * v;
        }
      }

      let mono = 0;
      for (let c = 0; c < channels; c++) {
        const d = cap && cap.length ? cap[Math.min(c, cap.length - 1)][i] : 0;
        mono += d;
        if (c === 0) this.level += 0.0005 * (d * d - this.level);
        if (this.delay < 0) {
          out[c][i] = d;
          continue;
        }
        const w = this.w[c];
        let y = 0;
        for (let j = 0; j < TAPS; j++) y += w[j] * x[j];
        const e = d - y;
        // Other sounds disturb the learning; the louder they are compared
        // with the voice, the smaller the step.
        if (pow > 1e-5) {
          const mu = this.t - this.lockedAt < FAST_FOR ? MU_FAST : MU_FINE;
          const g = mu * e / (pow + TAPS * this.level + 1e-6);
          for (let j = 0; j < TAPS; j++) w[j] += g * x[j];
        }
        out[c][i] = e;
      }

      // Decimated copies for the delay search.
      this.accRef += r;
      this.accCap += mono / channels;
      if ((this.t + 1) % DECIMATE === 0) {
        this.decRef[this.dt & H] = this.accRef / DECIMATE;
        this.decCap[this.dt & H] = this.accCap / DECIMATE;
        this.accRef = 0;
        this.accCap = 0;
        this.dt++;
        if (++this.sinceSearch >= SEARCH_EVERY && this.dt > WINDOW + MAX_LAG + 1 && this.nextLag < 0) {
          this.sinceSearch = 0;
          this.startSearch();
        }
      }
      this.t++;
    }
    if (this.nextLag >= 0) this.continueSearch();
    // A filter that blew up starts over, and the sound passes as it came.
    for (let c = 0; c < channels; c++) {
      if (!Number.isFinite(this.w[c][0]) || !Number.isFinite(out[c][0])) {
        this.w[c].fill(0);
        if (cap && cap.length) out[c].set(cap[Math.min(c, cap.length - 1)]);
      }
    }
    return true;
  }
}

registerProcessor('echo-cut', EchoCut);
