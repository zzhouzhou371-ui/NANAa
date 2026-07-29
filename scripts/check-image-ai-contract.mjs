import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

function loadTypeScriptModule(filePath, mocks = {}) {
  const source = readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  });
  const module = { exports: {} };
  const localRequire = specifier => (
    Object.prototype.hasOwnProperty.call(mocks, specifier)
      ? mocks[specifier]
      : require(specifier)
  );
  const context = vm.createContext({
    exports: module.exports,
    module,
    require: localRequire,
    console,
    URL,
    Date,
    Math,
    Set,
    Map,
  });
  vm.runInContext(compiled.outputText, context, { filename: filePath });
  return module.exports;
}

const providerPath = resolve(root, 'src/services/providerCapabilityRuntime.ts');
const storeSource = readFileSync(resolve(root, 'src/stores/nanaStore.ts'), 'utf8');
const providerRuntime = loadTypeScriptModule(providerPath);
const requests = [];
let providerPayload = null;
let responseOk = true;
let responseStatus = 200;
const files = new Map();

class MockFile {
  constructor(uri) {
    const record = files.get(uri);
    this.exists = Boolean(record);
    this.size = record?.size || 0;
    this.value = record?.base64 || '';
  }

  async base64() {
    return this.value;
  }
}

const networkMock = {
  fetchWithTimeout: async (url, init, timeoutMs) => {
    requests.push({ url, init, timeoutMs });
    return {
      ok: responseOk,
      status: responseStatus,
      data: providerPayload,
    };
  },
  readResponsePayload: async response => ({
    data: response.data,
    text: JSON.stringify(response.data),
  }),
  responseErrorMessage: response => `mock provider error ${response.status}`,
};

const imagePath = resolve(root, 'src/services/imageAiRuntime.ts');
const runtime = loadTypeScriptModule(imagePath, {
  'expo-file-system': { File: MockFile },
  './network': networkMock,
  './providerCapabilityRuntime': providerRuntime,
});

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
const durableUri = 'file:///documents/nana-media/images/test-photo.jpg';
files.set(durableUri, { size: 320_000, base64: 'ZmFrZS1pbWFnZQ==' });

expect(runtime.isDurableNanaImageUri(durableUri), 'Nana document image must pass the durable URI gate');
expect(!runtime.isDurableNanaImageUri('file:///cache/nana-media/images/temp.jpg'), 'cache image must fail the durable URI gate');
expect(!runtime.isDurableNanaImageUri('https://example.com/photo.jpg'), 'remote image must fail the durable URI gate');
expect(runtime.imageMimeTypeForUri(durableUri) === 'image/jpeg', 'JPG URI must map to image/jpeg');

const geminiVision = providerRuntime.normalizeProviderCapabilityEndpoint('vision', {
  enabled: true,
  provider: 'officialGemini',
  apiUrl: 'https://generativelanguage.googleapis.com',
  apiKey: 'gemini-secret',
  model: 'gemini-2.5-flash',
});
providerPayload = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          description: 'A person holding a purple umbrella in the rain.',
          objects: ['umbrella'],
          people: ['one person'],
          sensitive: false,
          sensitiveCategories: [],
          confidence: 0.91,
        }),
      }],
    },
  }],
};
const geminiResult = await runtime.analyzeDurableImage({
  imageUri: durableUri,
  vision: geminiVision,
  language: 'en-US',
});
expect(geminiResult.description.includes('purple umbrella'), 'Gemini result must return a structured description');
expect(geminiResult.objects[0] === 'umbrella', 'Gemini result must normalize visible objects');
expect(geminiResult.confidence === 0.91, 'Gemini result must preserve bounded confidence');
expect(requests[0].url.includes(':generateContent?key='), 'Gemini vision must use generateContent');
expect(requests[0].timeoutMs === 45_000, 'vision requests must have a bounded default timeout');
const geminiBody = JSON.parse(requests[0].init.body);
expect(
  geminiBody.contents[0].parts[1].inlineData.data === 'ZmFrZS1pbWFnZQ==',
  'Gemini request must inline the durable image bytes',
);

const compatibleVision = providerRuntime.normalizeProviderCapabilityEndpoint('vision', {
  enabled: true,
  provider: 'openAICompatible',
  apiUrl: 'https://ai.example.com/v1',
  apiKey: 'compatible-secret',
  model: 'vision-model',
});
providerPayload = {
  choices: [{
    message: {
      content: '```json\n{"description":"A quiet desk.","objects":["lamp"],"people":[],"sensitive":false,"confidence":2}\n```',
    },
  }],
};
const compatibleResult = await runtime.analyzeDurableImage({
  imageUri: durableUri,
  vision: compatibleVision,
});
expect(compatibleResult.description === 'A quiet desk.', 'compatible result must parse fenced JSON');
expect(compatibleResult.confidence === 1, 'confidence must be clamped to one');
expect(requests[1].url === 'https://ai.example.com/v1/chat/completions', 'compatible vision must use chat completions');
const compatibleBody = JSON.parse(requests[1].init.body);
expect(
  compatibleBody.messages[0].content[1].image_url.url.startsWith('data:image/jpeg;base64,'),
  'compatible vision must use a single image data URL',
);

files.set(durableUri, { size: 11 * 1_024 * 1_024, base64: 'oversized' });
let tooLargeCode = '';
try {
  await runtime.analyzeDurableImage({ imageUri: durableUri, vision: compatibleVision });
} catch (error) {
  tooLargeCode = error.code;
}
expect(tooLargeCode === 'FILE_TOO_LARGE', 'oversized images must fail before a provider request');

const unconfiguredVision = providerRuntime.normalizeProviderCapabilityEndpoint('vision', {
  enabled: true,
  apiUrl: 'https://ai.example.com/v1',
  apiKey: '',
  model: 'vision-model',
});
let unconfiguredCode = '';
try {
  await runtime.analyzeDurableImage({ imageUri: durableUri, vision: unconfiguredVision });
} catch (error) {
  unconfiguredCode = error.code;
}
expect(unconfiguredCode === 'UNCONFIGURED', 'missing vision credentials must be explicit');
expect(
  storeSource.includes("import { analyzeDurableImage } from '../services/imageAiRuntime'"),
  'the chat store must import the durable image understanding runtime',
);
expect(
  storeSource.includes('await analyzeDurableImage({'),
  'user photo messages must actually invoke image understanding',
);
expect(
  storeSource.includes('createLegacyProviderCapabilitySettings({')
    && storeSource.includes('vision: providerSettings.vision'),
  'the current provider settings must be mapped explicitly into the vision capability',
);
expect(
  storeSource.includes("type === 'image' && finalizedMediaCapture?.localUri")
    && storeSource.includes('imageUri: finalizedMediaCapture.localUri'),
  'a user photo must remain an image message while its description is sent to the model',
);

if (errors.length > 0) {
  console.error('Image AI contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Image AI contract check passed.');
}
