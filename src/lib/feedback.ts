/**
 * Sonido y vibración: extras opcionales. Los tonos se generan en la app, sin archivos, y el feedback
 * nunca depende de ellos (sección 7).
 */
let audio: AudioContext | undefined;

function tone(context: AudioContext, frequency: number, at: number, seconds: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + seconds);
}

export function playResult(
  correct: boolean,
  options: { sound: boolean; vibration: boolean },
): void {
  if (options.vibration && 'vibrate' in navigator) navigator.vibrate(correct ? 15 : [30, 40, 30]);
  if (!options.sound) return;
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    if (correct) {
      tone(audio, 660, now, 0.12);
      tone(audio, 880, now + 0.09, 0.16);
    } else {
      tone(audio, 220, now, 0.22);
    }
  } catch {
    // Sin audio la app sigue igual: el resultado ya está en pantalla.
  }
}
