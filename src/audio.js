class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Classic high-pitched POS barcode gun beep
  playScanBeep() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2100, this.ctx.currentTime); // High crisp beep
      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio feedback error', e);
    }
  }

  // Success two-tone chime for loan complete or return
  playSuccessChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [
        { freq: 523.25, time: now },       // C5
        { freq: 659.25, time: now + 0.09 }, // E5
        { freq: 783.99, time: now + 0.18 }  // G5
      ].forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, note.time);
        gain.gain.setValueAtTime(0.15, note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, note.time + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(note.time);
        osc.stop(note.time + 0.25);
      });
    } catch (e) {
      console.warn('Audio feedback error', e);
    }
  }

  // Warning buzz
  playWarningBuzz() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio feedback error', e);
    }
  }
}

export const sounds = new SoundManager();
