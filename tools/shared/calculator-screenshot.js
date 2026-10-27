const MAX_SCREENSHOT_BYTES = 300_000;

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function backgroundImageUrl(shell) {
  const image = getComputedStyle(shell).backgroundImage;
  const match = image.match(/^url\(["']?(.*?)["']?\)$/);
  return match ? new URL(match[1], document.baseURI).href : '';
}

async function loadPanelImage(shell) {
  const source = backgroundImageUrl(shell);
  if (!source) return null;
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  try { await image.decode(); return image; } catch { return null; }
}

function paintKey(context, key, shellRect, scale) {
  const rect = key.getBoundingClientRect();
  const x = (rect.left - shellRect.left) * scale;
  const y = (rect.top - shellRect.top) * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;
  const orange = key.classList.contains('orange');
  const disabled = key.getAttribute('aria-disabled') === 'true';
  context.globalAlpha = disabled ? 0.55 : 1;
  context.fillStyle = orange ? '#d97736' : key.classList.contains('mod') ? '#999da0' : '#30323a';
  context.strokeStyle = orange ? '#873e20' : '#171a1e';
  context.lineWidth = Math.max(1, 1.4 * scale);
  drawRoundedRect(context, x, y, width, height, Math.max(3, Math.min(width, height) * 0.22));
  context.fill();
  context.stroke();
  context.globalAlpha = 1;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const span of key.querySelectorAll('.key-base, .key-legend')) {
    const textRect = span.getBoundingClientRect();
    const fontStyle = getComputedStyle(span);
    const fontSize = Math.max(7, Number.parseFloat(fontStyle.fontSize) * scale);
    context.font = `${fontStyle.fontWeight} ${fontSize}px ${fontStyle.fontFamily}`;
    context.fillStyle = fontStyle.color === 'rgba(0, 0, 0, 0)' ? '#ffffff' : fontStyle.color;
    context.fillText(span.textContent.trim(), (textRect.left - shellRect.left + textRect.width / 2) * scale,
      (textRect.top - shellRect.top + textRect.height / 2) * scale, Math.max(10, textRect.width * scale));
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function base64FromBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export async function captureCalculatorScreenshot({ shell, lcdCanvas, model }) {
  const shellRect = shell.getBoundingClientRect();
  if (!shellRect.width || !shellRect.height) throw new Error('Calculator screen is not visible.');
  const panelImage = await loadPanelImage(shell);
  for (const targetWidth of [760, 640, 512, 400]) {
    const scale = targetWidth / shellRect.width;
    const result = document.createElement('canvas');
    result.width = targetWidth;
    result.height = Math.round(shellRect.height * scale);
    const context = result.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is unavailable.');
    context.fillStyle = '#d9dadd';
    context.fillRect(0, 0, result.width, result.height);
    if (panelImage) context.drawImage(panelImage, 0, 0, result.width, result.height);
    for (const key of shell.querySelectorAll('.key')) paintKey(context, key, shellRect, scale);
    const lcdRect = lcdCanvas.getBoundingClientRect();
    context.drawImage(lcdCanvas, (lcdRect.left - shellRect.left) * scale,
      (lcdRect.top - shellRect.top) * scale, lcdRect.width * scale, lcdRect.height * scale);
    context.fillStyle = '#36424b';
    context.font = `600 ${Math.max(8, 11 * scale)}px system-ui, sans-serif`;
    context.textAlign = 'right';
    context.fillText(`${model} · ${new Date().toISOString()}`, result.width - 12, result.height - 9);
    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const blob = await canvasBlob(result, type, quality);
        if (!blob || blob.size > MAX_SCREENSHOT_BYTES) continue;
        return { mimeType: blob.type, base64: base64FromBytes(await blob.arrayBuffer()), bytes: blob.size };
      }
    }
  }
  throw new Error('Could not compress screenshot below 300 KB.');
}
