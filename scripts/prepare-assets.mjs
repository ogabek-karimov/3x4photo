// Orqa fon o'chirish modeli va ONNX runtime fayllarini app/bg-data ichiga yig'adi.
// Dastur internetga murojaat qilmasdan (to'liq oflayn) ishlashi uchun kerak.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'node_modules/@imgly/background-removal-data/dist');
const ortDir = path.join(root, 'node_modules/onnxruntime-web/dist');
const outDir = path.join(root, 'app/bg-data');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const srcRes = JSON.parse(fs.readFileSync(path.join(dataDir, 'resources.json'), 'utf8'));
const resources = {};

// ISNet fp16 modeli ("medium") — sifat va tezlik o'rtasidagi eng yaxshi muvozanat
const model = srcRes['/models/medium'];
for (const chunk of model.chunks) {
  fs.copyFileSync(path.join(dataDir, chunk.hash), path.join(outDir, chunk.hash));
}
resources['/models/isnet_fp16'] = {
  ...model,
  chunks: model.chunks.map((c) => ({ ...c, name: c.hash }))
};

for (const [file, mime] of [
  ['ort-wasm-simd-threaded.wasm', 'application/wasm'],
  ['ort-wasm-simd-threaded.mjs', 'text/javascript']
]) {
  const buf = fs.readFileSync(path.join(ortDir, file));
  fs.writeFileSync(path.join(outDir, file), buf);
  resources[`/onnxruntime-web/${file}`] = {
    chunks: [{ name: file, offsets: [0, buf.length] }],
    size: buf.length,
    mime
  };
}

fs.writeFileSync(path.join(outDir, 'resources.json'), JSON.stringify(resources, null, 2));
console.log('bg-data tayyor:', Object.keys(resources).join(', '));

// Yuzni aniqlash modellari (3x4 kadrlash va kiyimni joylash uchun)
const faceSrc = path.join(root, 'node_modules/@vladmandic/face-api/model');
const faceOut = path.join(root, 'app/models/face');
fs.rmSync(faceOut, { recursive: true, force: true });
fs.mkdirSync(faceOut, { recursive: true });
for (const name of ['ssd_mobilenetv1_model', 'face_landmark_68_model']) {
  for (const ext of ['-weights_manifest.json', '.bin']) {
    fs.copyFileSync(path.join(faceSrc, name + ext), path.join(faceOut, name + ext));
  }
}
console.log('face modellari tayyor');
