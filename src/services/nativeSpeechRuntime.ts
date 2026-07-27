import * as Speech from 'expo-speech';
import type { MediaCaptureResult, SpeechSynthesisPlan } from './mediaRuntime';

export const speakSpeechSynthesisPlan = async (
  plan: SpeechSynthesisPlan,
  options: { waitForCompletion?: boolean } = {},
): Promise<MediaCaptureResult> => {
  if (plan.phase !== 'ready') {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      errorMessage: plan.errorMessage || 'Speech synthesis is not ready',
    };
  }

  await Speech.stop();
  const speakOptions = {
    language: plan.language,
    voice: plan.voiceProfileId,
    rate: 0.96,
    pitch: 1,
    volume: 1,
    useApplicationAudioSession: true,
  };

  if (options.waitForCompletion) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        resolve();
      };
      const safetyTimer = setTimeout(settle, 60000);
      Speech.speak(plan.text, {
        ...speakOptions,
        onDone: settle,
        onStopped: settle,
        onError: settle,
      });
    });
  } else {
    Speech.speak(plan.text, speakOptions);
  }

  return {
    phase: 'ready',
    mediaKind: 'audio',
    transcript: plan.text,
  };
};

export const stopSpeechSynthesis = () => Speech.stop();

export const isSpeechSynthesisActive = () => Speech.isSpeakingAsync();
