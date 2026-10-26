import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

import { useSettings, type Volume } from '@/settings';

const SOURCES = {
  correct: require('../assets/sounds/correct.wav'),
  wrong: require('../assets/sounds/wrong.wav'),
  tap: require('../assets/sounds/tap.wav'),
  zoom: require('../assets/sounds/zoom.wav'),
  record: require('../assets/sounds/record.wav'),
  help: require('../assets/sounds/help.wav'),
};

export type Cue = keyof typeof SOURCES;

const VOLUME: Record<Volume, number> = { off: 0, low: 0.3, medium: 0.6, high: 1 };

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
        if (p.playing || p.currentTime > 0) {
          // Played before: rewind first and only then play. Calling play()
          // while the seek is still pending is lost on a finished player, so
          // every other answer was silent.
          p.seekTo(0).then(() => p.play()).catch(() => {});
        } else {
          p.play();
        }
      } catch {
        // Sound is a nice-to-have; never break the game over it.
      }
    },
    [sound],
  );
}
