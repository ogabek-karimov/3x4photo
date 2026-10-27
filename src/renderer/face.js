import * as faceapi from '@vladmandic/face-api';

let ready = null;

function init() {
  if (!ready) {
    // face-api faqat http(s) protokolini taniydi, shuning uchun nisbiy yo'l beramiz
    const uri = '/models/face';
    ready = (async () => {
      // GPU (WebGL) bo'lmasa protsessorda ishlaydi
      const ok = await faceapi.tf.setBackend('webgl').catch(() => false);
      if (!ok) await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(uri);
      await faceapi.nets.faceLandmark68Net.loadFromUri(uri);
    })();
  }
  return ready;
}

// Yuz o'lchamlari (rasm piksellarida): iyak, yuz kengligi, ko'zlar
export async function detectFace(bmp) {
  await init();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);

  const det = await faceapi
    .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks();
  if (!det) return null;

  const pts = det.landmarks.positions.map((p) => ({ x: p.x / scale, y: p.y / scale }));
  const avg = (arr) => ({
    x: arr.reduce((s, p) => s + p.x, 0) / arr.length,
    y: arr.reduce((s, p) => s + p.y, 0) / arr.length
  });
  const jawL = pts[0];
  const jawR = pts[16];
  const chin = pts[8];
  const eyeL = avg(pts.slice(36, 42));
  const eyeR = avg(pts.slice(42, 48));
  const faceWidth = Math.hypot(jawR.x - jawL.x, jawR.y - jawL.y);
  return {
    chin,
    eyeL,
    eyeR,
    faceWidth,
    centerX: (jawL.x + jawR.x + chin.x) / 3,
    tilt: Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x)
  };
}
