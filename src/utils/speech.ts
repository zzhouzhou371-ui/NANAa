import * as Speech from 'expo-speech';

const nativeSpeechRecognitionUnavailable = () =>
  new Error('Native speech recognition is not installed in this build.');

export class SpeechService {
  static speak(text: string, language = 'zh-CN') {
    Speech.speak(text, {
      language,
      pitch: 1.0,
      rate: 0.9,
    });
  }

  static stop() {
    Speech.stop();
  }

  static async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  }

  static async startRecording(language = 'zh-CN'): Promise<void> {
    void language;
    throw nativeSpeechRecognitionUnavailable();
  }

  static async stopRecording(): Promise<string> {
    throw nativeSpeechRecognitionUnavailable();
  }
}
