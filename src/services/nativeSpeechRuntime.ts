import * as Speech from 'expo-speech';
import type { MediaCaptureResult, SpeechSynthesisPlan } from './mediaRuntime';

let availableVoicesPromise: ReturnType<typeof Speech.getAvailableVoicesAsync> | null = null;

const resolveDeviceVoice = async (requestedVoice: string | undefined, language: string) => {
  try {
    availableVoicesPromise ||= Speech.getAvailableVoicesAsync();
    const voices = await availableVoicesPromise;
    const requested = requestedVoice?.trim().toLowerCase();
    const exact = requested
      ? voices.find(voice => (
          voice.identifier.toLowerCase() === requested
          || voice.name.toLowerCase() === requested
        ))
      : undefined;
    if (exact) return exact.identifier;

    const normalizedLanguage = language.toLowerCase();
    const languageBase = normalizedLanguage.split('-')[0];
    const languageMatch = voices.find(voice => voice.language.toLowerCase() === normalizedLanguage)
      || voices.find(voice => voice.language.toLowerCase().startsWith(`${languageBase}-`));
    return languageMatch?.identifier;
  } catch {
    availableVoicesPromise = null;
    return undefined;
  }
};

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

  try {
    await Speech.stop();
    const deviceVoice = await resolveDeviceVoice(plan.voiceProfileId, plan.language);
    const speakOptions = {
      language: plan.language,
      ...(deviceVoice ? { voice: deviceVoice } : {}),
      rate: 0.96,
      pitch: 1,
      volume: 1,
      useApplicationAudioSession: true,
    };

    if (options.waitForCompletion) {
      const completed = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (success: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(safetyTimer);
          resolve(success);
        };
        const safetyTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          void Speech.stop();
          resolve(false);
        }, 60000);
        Speech.speak(plan.text, {
          ...speakOptions,
          onDone: () => settle(true),
          onStopped: () => settle(false),
          onError: () => settle(false),
        });
      });
      if (!completed) {
        return {
          phase: 'failed',
          mediaKind: 'audio',
          transcript: plan.text,
          errorMessage: 'Device speech did not finish successfully',
        };
      }
    } else {
      Speech.speak(plan.text, speakOptions);
    }

    return {
      phase: 'ready',
      mediaKind: 'audio',
      transcript: plan.text,
    };
  } catch (error) {
    return {
      phase: 'failed',
      mediaKind: 'audio',
      transcript: plan.text,
      errorMessage: error instanceof Error ? error.message : 'Device speech is unavailable',
    };
  }
};

export const stopSpeechSynthesis = () => Speech.stop();

export const isSpeechSynthesisActive = () => Speech.isSpeakingAsync();
