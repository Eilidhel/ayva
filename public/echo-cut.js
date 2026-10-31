// Leaves a phone's own voice out of the computer sound sent back to it.
//
// Input 0 is the computer's sound as captured from the speakers' mix
// ("loopback"), which includes the phone's voice as Ayva plays it. Input 1 is
// that voice itself, as received. The path between them is digital (no room,
// no microphone), so the voice reaches the capture as a delayed, scaled copy:
//   1. find the delay by cross-correlating the two (on a decimated, whitened
//      copy), spread over many audio blocks so playback never stalls, and
//   2. at that delay, estimate the short filter that turns the voice into its
//      copy (gain, exact timing, any resampling) from a few seconds of
//      averages, and subtract the copy. Other sounds (people, games, music)
//      are unrelated to the voice, so they average out of the estimate and
//      pass through untouched.
//   3. follow the copy's loudness within a tenth of a second: Windows and
//      call apps such as Discord turn other programs down while someone
//      talks, which would leave the slow estimate too loud or too quiet.
// Until a delay is found the sound passes through unchanged. Once a second it
// reports what it is doing ({ delay, captured, sent, voice } powers).

const DECIMATE = 8;          // delay search runs at 6 kHz
const HISTORY = 8192;        // decimated samples kept (~1.4 s), a power of two
const SEARCH_EVERY = 1500;   // decimated samples between searches (0.25 s)
const WINDOW = 3000;         // decimated samples compared per search (0.5 s)
const MAX_LAG = 4800;        // longest delay looked for (0.8 s)
const LAGS_PER_BLOCK = 50;   // search work per 128-sample block (a search takes ~0.27 s)
const PEAK = 6;              // a match must stand this many deviations above the rest…
const SURE = 12;             // …or this many to be trusted on its own
const REF_SIZE = 65536;      // full-rate voice history (~1.4 s), a power of two
const TAPS = 32;             // filter length around the found delay
const LEAD = 12;             // taps before the delay (the search is exact to ±8 samples)
const MEMORY = 4 * 48000;    // samples the averages remember (~4 s)
const SOLVE_EVERY = 12000;   // samples between filter updates (0.25 s)
const GAIN_TRACK = 1 / 4800; // the copy's loudness is followed within ~0.1 s

const H = HISTORY - 1;
const R = REF_SIZE - 1;

// Solves A w = b for the symmetric positive definite A (n×n, row-major) by
// Cholesky. A is overwritten. Returns false when A is not usable.
function cholSolve(A, b, w, n) {
  for (let j = 0; j < n; j++) {
    let s = A[j * n + j];
    for (let k = 0; k < j; k++) s -= A[j * n + k] * A[j * n + k];
    if (!(s > 0)) return false;
    const d = Math.sqrt(s);
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = A[i * n + j];
      for (let k = 0; k < j; k++) t -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = t / d;
    }
  }
  for (let i = 0; i < n; i++) {
    let t = b[i];
    for (let k = 0; k < i; k++) t -= A[i * n + k] * w[k];
    w[i] = t / A[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let t = w[i];
    for (let k = i + 1; k < n; k++) t -= A[k * n + i] * w[k];
    w[i] = t / A[i * n + i];
  }
  return true;
}

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
    this.candidate = -1;
    this.x = new Float32Array(TAPS);
    // Running averages for the filter: the voice's autocorrelation, and the
    // correlation of each captured channel with the voice.
    this.r = new Float64Array(TAPS);
    this.p = [new Float64Array(TAPS), new Float64Array(TAPS)];
    this.w = [new Float32Array(TAPS), new Float32Array(TAPS)];
    // Fast loudness correction per channel: a gain s on the copy, learned
    // against the copy's power py and what is left over, pe (other sound).
    this.s = [1, 1];
    this.py = [0, 0];
    this.pe = [0, 0];
    this.A = new Float64Array(TAPS * TAPS);
    this.wTmp = new Float64Array(TAPS);
    this.sinceSolve = 0;
    this.solveSecond = false;
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
    // A diagnostic recording in progress: voice, captured (left), sent (left).
    this.rec = null;
    this.recAt = 0;
    this.port.onmessage = (m) => {
      if (m.data && m.data.record) {
        const n = Math.min(48000 * 20, m.data.record | 0);
        this.rec = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
        this.recAt = 0;
      }
    };
    // Report.
    this.repCap = 0;
    this.repOut = 0;
    this.repVoice = 0;
    this.repN = 0;
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
    if (this.count < 100) return; // the voice was silent: nothing to learn

    const mean = this.sum / this.count;
    const sd = Math.sqrt(Math.max(0, this.sumSq / this.count - mean * mean));
    const lag = this.bestScore > mean + PEAK * sd ? this.best : -1;
    const sure = this.bestScore > mean + SURE * sd;
    // A clear match is trusted at once, a weaker one when two in a row agree.
    if (lag >= 0 && (sure || (this.candidate >= 0 && Math.abs(lag - this.candidate) <= 1))) {
      const delay = lag * DECIMATE;
      // A shift smaller than LEAD is still inside the filter: keep learning.
      if (this.delay < 0 || Math.abs(delay - this.delay) > LEAD) this.lock(delay);
    }
    this.candidate = lag;
  }

  lock(delay) {
    this.delay = delay;
    this.r.fill(0);
    this.p[0].fill(0);
    this.p[1].fill(0);
    this.w[0].fill(0);
    this.w[1].fill(0);
    this.s = [1, 1];
    this.py = [0, 0];
    this.pe = [0, 0];
    this.sinceSolve = SOLVE_EVERY - 4800; // first estimate after 0.1 s
  }

  // The filter from the averages: (Toeplitz autocorrelation) w = cross-correlation.
  // One channel per call, so no audio block carries both.
  solve(c) {
    const r0 = this.r[0];
    if (!(r0 > 1e-6)) return;
    {
      for (let i = 0; i < TAPS; i++) {
        for (let j = 0; j < TAPS; j++) this.A[i * TAPS + j] = this.r[Math.abs(i - j)];
        this.A[i * TAPS + i] += r0 * 1e-4; // keeps it solvable when the voice is narrow
      }
      if (cholSolve(this.A, this.p[c], this.wTmp, TAPS)) {
        // Carry the loudness correction over to the new filter, so the copy
        // being subtracted does not jump: s·w_old ≈ s_new·w_new.
        let on = 0;
        let nn = 0;
        for (let j = 0; j < TAPS; j++) {
          on += this.w[c][j] * this.wTmp[j];
          nn += this.wTmp[j] * this.wTmp[j];
        }
        const s = nn > 0 && on > 0 ? this.s[c] * on / nn : 1;
        this.s[c] = Math.min(4, Math.max(0, s));
        for (let j = 0; j < TAPS; j++) this.w[c][j] = this.wTmp[j];
      }
    }
  }

  process(inputs, outputs) {
    const cap = inputs[0];
    const voice = inputs[1];
    const out = outputs[0];
    const frames = out[0].length;
    const channels = Math.min(out.length, 2);
    const x = this.x;
    const locked = this.delay >= 0;
    // Forget slowly, once per block.
    if (locked) {
      const keep = Math.pow(1 - 1 / MEMORY, frames);
      for (let j = 0; j < TAPS; j++) {
        this.r[j] *= keep;
        this.p[0][j] *= keep;
        this.p[1][j] *= keep;
      }
    }
    for (let i = 0; i < frames; i++) {
      // The voice, mixed to mono.
      let r = 0;
      if (voice && voice.length) {
        for (let c = 0; c < voice.length; c++) r += voice[c][i];
        r /= voice.length;
      }
      this.ref[this.t & R] = r;
      this.repVoice += r * r;

      if (locked) {
        // The voice around the found delay, newest first.
        const start = this.t - this.delay + LEAD;
        for (let j = 0; j < TAPS; j++) x[j] = this.ref[(start - j) & R];
        const x0 = x[0];
        for (let k = 0; k < TAPS; k++) this.r[k] += x0 * x[k];
      }

      let mono = 0;
      for (let c = 0; c < channels; c++) {
        const d = cap && cap.length ? cap[Math.min(c, cap.length - 1)][i] : 0;
        mono += d;
        let e = d;
        if (locked) {
          const w = this.w[c];
          const p = this.p[c];
          let y = 0;
          for (let j = 0; j < TAPS; j++) {
            y += w[j] * x[j];
            p[j] += d * x[j];
          }
          e = d - this.s[c] * y;
          this.py[c] += GAIN_TRACK * (y * y - this.py[c]);
          this.pe[c] += GAIN_TRACK * (e * e - this.pe[c]);
          // Fast while the voice dominates, slower the louder other sound is.
          if (this.py[c] > 1e-10) {
            const s = this.s[c] + GAIN_TRACK * e * y / (this.py[c] + this.pe[c]);
            this.s[c] = Math.min(4, Math.max(0, s));
          }
        }
        out[c][i] = e;
        if (c === 0) {
          this.repCap += d * d;
          this.repOut += e * e;
          if (this.rec) {
            this.rec[0][this.recAt] = r;
            this.rec[1][this.recAt] = d;
            this.rec[2][this.recAt] = e;
            if (++this.recAt >= this.rec[0].length) {
              this.port.postMessage({ recording: this.rec, delay: this.delay });
              this.rec = null;
            }
          }
        }
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
    if (locked && (this.sinceSolve += frames) >= SOLVE_EVERY) {
      this.sinceSolve = 0;
      this.solve(0);
      this.solveSecond = channels > 1;
    } else if (this.solveSecond) {
      this.solveSecond = false;
      this.solve(1);
    }
    if (this.nextLag >= 0) this.continueSearch();
    // Anything gone wrong: pass the sound as it came and start the filter over.
    for (let c = 0; c < channels; c++) {
      if (!Number.isFinite(out[c][0]) || !Number.isFinite(this.w[c][0])) {
        this.w[c].fill(0);
        if (cap && cap.length) out[c].set(cap[Math.min(c, cap.length - 1)]);
      }
    }
    if ((this.repN += frames) >= 48000) {
      this.port.postMessage({
        delay: this.delay,
        captured: this.repCap / this.repN,
        sent: this.repOut / this.repN,
        voice: this.repVoice / this.repN,
      });
      this.repCap = this.repOut = this.repVoice = this.repN = 0;
    }
    return true;
  }
}

registerProcessor('echo-cut', EchoCut);
