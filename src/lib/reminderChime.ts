/**
 * Reminder sounds synthesized with WebAudio — no bundled audio assets and no
 * CSP media-src surface. Two distinct voices: a bright two-note ding when a
 * task's time arrives, and a softer descending bell when its duration runs
 * out. Every call is best-effort; audio failures must never break the app.
 */

type ChimeNote = {
  frequency: number;
  /** Offset from the chime start, seconds. */
  at: number;
  duration: number;
  peak: number;
};

const START_CHIME: ChimeNote[] = [
  { frequency: 1318.5, at: 0, duration: 0.28, peak: 0.16 },
  { frequency: 1760, at: 0.12, duration: 0.42, peak: 0.2 },
];

const END_CHIME: ChimeNote[] = [
  { frequency: 987.8, at: 0, duration: 0.34, peak: 0.16 },
  { frequency: 784, at: 0.18, duration: 0.38, peak: 0.15 },
  { frequency: 659.3, at: 0.36, duration: 0.6, peak: 0.14 },
];

let sharedContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const Constructor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) {
    return null;
  }
  if (!sharedContext) {
    sharedContext = new Constructor();
  }
  return sharedContext;
};

const playNotes = (notes: ChimeNote[]) => {
  try {
    const context = getAudioContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }

    const now = context.currentTime + 0.02;
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequency;
      // Fast attack, exponential decay: reads as a soft bell, not a beep.
      gain.gain.setValueAtTime(0.0001, now + note.at);
      gain.gain.exponentialRampToValueAtTime(note.peak, now + note.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + note.at);
      oscillator.stop(now + note.at + note.duration + 0.05);
    }
  } catch {
    // Audio is a nicety; never let it throw into the reminder loop.
  }
};

export const playStartChime = () => playNotes(START_CHIME);
export const playEndChime = () => playNotes(END_CHIME);
