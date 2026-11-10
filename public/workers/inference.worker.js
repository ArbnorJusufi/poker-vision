/* Runs the card detector's neural network off the UI thread.
 * Protocol (main -> worker): {type:'init', modelUrl, ortBase} | {type:'run', id, input:Float32Array}
 * Protocol (worker -> main): {type:'status', text} | {type:'ready'} | {type:'error', id?, message}
 *                            | {type:'result', id, data:Float32Array, dims:number[]} */
let session = null;

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

async function downloadModel(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not download the card model (' + response.status + ').');
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    received += result.value.length;
    post({
      type: 'status',
      text: total
        ? 'Loading card detector… ' + Math.min(99, Math.round((received / total) * 100)) + '%'
        : 'Loading card detector… ' + (received / 1048576).toFixed(0) + ' MB',
    });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function init(modelUrl, ortBase) {
  post({ type: 'status', text: 'Loading card detector…' });
  importScripts(ortBase + 'ort.wasm.min.js');
  self.ort.env.wasm.wasmPaths = ortBase;
  self.ort.env.wasm.numThreads = 1;
  const bytes = await downloadModel(modelUrl);
  post({ type: 'status', text: 'Preparing card detector…' });
  session = await self.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  post({ type: 'ready' });
}

async function run(id, input) {
  const tensor = new self.ort.Tensor('float32', input, [1, 3, 640, 640]);
  const outputs = await session.run({ [session.inputNames[0]]: tensor });
  const output = outputs[session.outputNames[0]];
  const data = output.data;
  post({ type: 'result', id: id, data: data, dims: Array.from(output.dims) }, [data.buffer]);
}

self.onmessage = function (event) {
  const message = event.data;
  if (message.type === 'init') {
    init(message.modelUrl, message.ortBase).catch(function (error) {
      post({ type: 'error', message: String((error && error.message) || error) });
    });
  } else if (message.type === 'run') {
    if (!session) {
      post({ type: 'error', id: message.id, message: 'Detector is not loaded yet.' });
      return;
    }
    run(message.id, message.input).catch(function (error) {
      post({ type: 'error', id: message.id, message: String((error && error.message) || error) });
    });
  }
};
