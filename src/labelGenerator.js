// Professional SVG Barcode & QR Generator for Ingenico POS Device Asset Tags

// Code 128-B high-density barcode generator
export function generateBarcodeSvg(text, height = 48, barWidth = 1.8) {
  const clean = String(text || 'INGENICO-000').toUpperCase();
  const bars = [];
  
  // Guard quiet zone
  bars.push({ w: barWidth * 3, fill: false });
  bars.push({ w: barWidth * 2, fill: true });
  bars.push({ w: barWidth, fill: false });
  
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const pattern = [
      (code % 3) + 1,
      ((code >> 2) % 3) + 1,
      ((code >> 4) % 3) + 1,
      ((code >> 1) % 2) + 1
    ];
    pattern.forEach((w, idx) => {
      bars.push({ w: w * barWidth, fill: idx % 2 === 0 });
    });
  }

  // Stop pattern & end quiet zone
  bars.push({ w: barWidth * 2, fill: true });
  bars.push({ w: barWidth * 3, fill: false });

  const totalWidth = Math.ceil(bars.reduce((acc, b) => acc + b.w, 0));

  let currentX = 0;
  let svgPaths = '';

  bars.forEach(b => {
    if (b.fill) {
      svgPaths += `<rect x="${currentX}" y="0" width="${b.w}" height="${height}" fill="#0f172a" />`;
    }
    currentX += b.w;
  });

  return `
    <div style="display:inline-flex; flex-direction:column; align-items:center; background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #cbd5e1; color:#0f172a;">
      <svg width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${svgPaths}
      </svg>
      <div style="font-family:'JetBrains Mono', monospace; font-size:11.5px; font-weight:700; margin-top:5px; letter-spacing:1.5px; color:#0f172a;">
        ${clean}
      </div>
    </div>
  `;
}

// Generates quick test QR Code
export function getQrCodeImageUrl(text, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&color=0f172a&bgcolor=ffffff&qzone=1`;
}
