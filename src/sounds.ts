import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

import { useSettings, type SoundLevel } from '@/settings';

const SOURCES = {
  correct: require('../assets/sounds/correct.wav'),
  wrong: require('../assets/sounds/wrong.wav'),
  tap: require('../assets/sounds/tap.wav'),
  zoom: require('../assets/sounds/zoom.wav'),
  record: require('../assets/sounds/record.wav'),
};

export type Cue = keyof typeof SOURCES;

const VOLUME: Record<SoundLevel, number> = { off: 0, low: 0.3, medium: 0.6, high: 1 };

const players: Partial<Record<Cue, AudioPlayer>> = {};
let modeSet = false;

function player(cue: Cue) {
  if (!modeSet) {
    modeSet = true;
    // Respect the silent switch and mix with the player's music.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }
  return (players[cue] ??= createAudioPlayer(SOURCES[cue]));
}

export function useSound() {
  const { sound } = useSettings();
  return useCallback(
    (cue: Cue) => {
      const volume = VOLUME[sound];
      if (!volume) return;
      try {
        const p = player(cue);
        p.volume = volume;
        p.seekTo(0).catch(() => {});
        p.play();
      } catch {
        // Sound is a nice-to-have; never break the game over it.
      }
    },
    [sound],
  );
}
