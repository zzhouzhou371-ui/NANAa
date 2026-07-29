import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'src/services/providerCapabilityRuntime.ts');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: sourcePath,
});
const module = { exports: {} };
const context = vm.createContext({
  exports: module.exports,
  module,
  require,
  console,
  URL,
});
vm.runInContext(compiled.outputText, context, { filename: sourcePath });

const runtime = module.exports;
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

expect(typeof runtime.normalizeProviderCapabilitySettings === 'function', 'settings normalizer must be exported');
expect(typeof runtime.diagnoseProviderCapabilities === 'function', 'capability diagnostics must be exported');
expect(typeof runtime.requireReadyProviderCapability === 'function', 'ready-capability gate must be exported');

const unconfigured = runtime.createLegacyProviderCapabilitySettings({
  apiUrl: 'https://generativelanguage.googleapis.com',
  apiKey: '',
  selectedModel: 'gemini-2.5-flash',
});
expect(
  runtime.diagnoseProviderCapability('vision', unconfigured.vision).status === 'unconfigured',
  'legacy settings without an API key must be explicitly unconfigured',
);

const gemini = runtime.createLegacyProviderCapabilitySettings({
  apiUrl: 'https://generativelanguage.googleapis.com/',
  apiKey: 'secret',
  selectedModel: 'gemini-2.5-flash',
});
const geminiDiagnostics = runtime.diagnoseProviderCapabilities(gemini);
expect(gemini.vision.provider === 'officialGemini', 'official Gemini URL must infer the Gemini provider');
expect(geminiDiagnostics.text.status === 'ready', 'configured Gemini text must be ready');
expect(geminiDiagnostics.vision.status === 'ready', 'configured Gemini vision must be ready');
expect(geminiDiagnostics.stt.status === 'ready', 'configured Gemini STT must be ready');
expect(geminiDiagnostics.tts.status === 'unsupported', 'Gemini TTS must not be falsely advertised');

const compatible = runtime.normalizeProviderCapabilityEndpoint('vision', {
  enabled: true,
  apiUrl: 'https://ai.example.com/v1/',
  apiKey: 'secret',
  model: 'vision-model',
});
const compatibleDiagnostic = runtime.diagnoseProviderCapability('vision', compatible);
expect(compatible.provider === 'openAICompatible', 'non-Gemini URL must infer OpenAI-compatible provider');
expect(compatible.apiUrl === 'https://ai.example.com/v1', 'normalization must trim trailing slashes');
expect(compatibleDiagnostic.status === 'ready', 'complete compatible vision settings must be ready');
expect(compatibleDiagnostic.warnings.length === 1, 'compatible providers must carry an endpoint-shape warning');

const mismatch = runtime.normalizeProviderCapabilityEndpoint('vision', {
  enabled: true,
  provider: 'officialGemini',
  apiUrl: 'https://ai.example.com/v1',
  apiKey: 'secret',
  model: 'vision-model',
});
expect(
  runtime.diagnoseProviderCapability('vision', mismatch).status === 'invalid',
  'provider and URL mismatch must be diagnosed',
);

if (errors.length > 0) {
  console.error('Provider capability contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Provider capability contract check passed.');
}
