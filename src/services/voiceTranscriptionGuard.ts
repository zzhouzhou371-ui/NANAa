import type { MediaCaptureResult } from './mediaRuntime';

export const VOICE_TRANSCRIPTION_MIN_DURATION_MS = 1000;
export const VOICE_CALL_TRANSCRIPTION_MIN_DURATION_MS = 160;
export const VOICE_TRANSCRIPTION_SPEECH_DB = -45;
export const VOICE_TRANSCRIPTION_MIN_VOICED_SAMPLES = 2;

export type LocalVoiceTranscriptionRejection = 'audioTooShort' | 'noSpeechDetected';

export interface LocalVoiceTranscriptionDecision {
  allowed: boolean;
  rejection?: LocalVoiceTranscriptionRejection;
  durationMillis: number;
  sampleCount: number;
  voicedSampleCount: number;
  peakDb?: number;
}

const measuredDurationMillis = (capture: MediaCaptureResult) => (
  capture.durationMillis ?? Math.round(Math.max(0, capture.durationSec || 0) * 1000)
);

/**
 * A conservative local gate before remote STT. Native captures explicitly
 * carry their metering samples, including an empty array when the platform
 * failed to report energy. Legacy/unmetered captures retain duration-only
 * compatibility, while measured silence can never be overridden by provider
 * text.
 */
export const evaluateLocalVoiceTranscription = (
  capture: MediaCaptureResult,
  minimumDurationMillis = VOICE_TRANSCRIPTION_MIN_DURATION_MS,
): LocalVoiceTranscriptionDecision => {
  const durationMillis = measuredDurationMillis(capture);
  const hasMeasuredDuration = Number.isFinite(capture.durationMillis)
    || Number.isFinite(capture.durationSec);
  const rawSamples = capture.meteringSamplesDb;
  const samples = rawSamples
    ?.filter(Number.isFinite)
    .map(sample => Math.max(-160, Math.min(0, sample))) ?? [];
  const peakDb = samples.length > 0 ? Math.max(...samples) : undefined;
  const voicedSampleCount = samples.filter(sample => sample >= VOICE_TRANSCRIPTION_SPEECH_DB).length;
  const base = {
    durationMillis,
    sampleCount: samples.length,
    voicedSampleCount,
    peakDb,
  };

  if (hasMeasuredDuration && durationMillis < minimumDurationMillis) {
    return { ...base, allowed: false, rejection: 'audioTooShort' };
  }

  if (rawSamples !== undefined && (
    samples.length < VOICE_TRANSCRIPTION_MIN_VOICED_SAMPLES
    || voicedSampleCount < VOICE_TRANSCRIPTION_MIN_VOICED_SAMPLES
  )) {
    return { ...base, allowed: false, rejection: 'noSpeechDetected' };
  }

  return { ...base, allowed: true };
};
