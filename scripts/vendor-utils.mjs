import { createHash } from 'node:crypto';

export function digest(bytes, algorithm = 'sha256') {
  return createHash(algorithm).update(bytes).digest('hex');
}
export function renderGeneratedVendorFile(item, sourceBytes) {
  if (item.generator !== 'pdfjs-base64-blob-worker-v1') {
    throw new Error(`unsupported generated vendor file: ${item.path}`);
  }
  const inputSha256 = digest(sourceBytes);
  if (inputSha256 !== item.inputSha256) {
    throw new Error(`generated vendor input SHA-256 mismatch for ${item.path}: expected ${item.inputSha256}, got ${inputSha256}`);
  }
  const encoded = sourceBytes.toString('base64');
  const output = `// Generated from ${item.sourcePath} SHA-256: ${inputSha256}\n` +
    '// On file://, bypass PDF.js nested blob importScripts because opaque origins cannot read blob:null from another worker.\n' +
    '(function(){"use strict";var b=atob("' + encoded + '");var a=new Uint8Array(b.length);' +
    'for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);' +
    'window.LT_PDF_WORKER_SRC=URL.createObjectURL(new Blob([a],{type:"text/javascript"}));' +
    'if(location.protocol==="file:"&&typeof window.Worker==="function"){var NativeWorker=window.Worker;' +
    'function OfflinePdfWorker(url,options){var requested=String(url);var embedded=window.LT_PDF_WORKER_SRC;' +
    'var selected=requested.indexOf("blob:")===0&&embedded&&requested!==embedded?embedded:url;' +
    'return new NativeWorker(selected,options)}OfflinePdfWorker.prototype=NativeWorker.prototype;' +
    'Object.setPrototypeOf(OfflinePdfWorker,NativeWorker);window.Worker=OfflinePdfWorker}})();\n';
  return Buffer.from(output, 'utf8');
}
