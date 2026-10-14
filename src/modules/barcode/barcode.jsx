"use client";
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export function barcodeValueOf(item) {
  const v = item?.serial_number || item?.product_code || item?.huid || "";
  return String(v).trim().toUpperCase();
}

function drawInto(svg, value, { height, width }) {
  JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 0, height, width, background: "transparent" });
}

export function Barcode({ value, format = "QR", height = 34, width = 1.4, className = "" }) {
  const ref = useRef(null);
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    if (!value) return;
    if (format === "QR") {
      QRCode.toDataURL(value, { margin: 0, width: height * 3 })
        .then(setQrUrl)
        .catch(() => {});
    } else {
      if (!ref.current) return;
      try { drawInto(ref.current, value, { height, width }); } catch {}
    }
  }, [value, format, height, width]);

  if (!value) return null;

  if (format === "QR") {
    return qrUrl ? (
      <img src={qrUrl} className={className} style={{ objectFit: "contain" }} alt={`QR ${value}`} />
    ) : null;
  }

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function printBarcodeLabels(labels, format = "QR") {
  const list = (labels || []).filter((l) => l?.value);
  if (!list.length) return false;

  const cells = await Promise.all(list.map(async (l) => {
    let graphicHtml = "";
    if (format === "QR") {
      try {
        const url = await QRCode.toDataURL(l.value, { margin: 0, width: 120 });
        graphicHtml = `<img src="${url}" class="qr-img" />`;
      } catch { return ""; }
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      try { drawInto(svg, l.value, { height: 40, width: 2 }); } catch { return ""; }
      svg.setAttribute("preserveAspectRatio", "none");
      graphicHtml = svg.outerHTML;
    }
    return `<div class="l"><div class="t">${esc(l.title)}</div>${graphicHtml}<div class="c">${esc(l.value)}</div><div class="s">${esc(l.line)}</div></div>`;
  }));

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
@page{size:A4;margin:10.7mm 4.65mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.g{display:grid;grid-template-columns:repeat(5,38.1mm);grid-auto-rows:21.2mm;column-gap:2.5mm}
.l{overflow:hidden;padding:1.2mm 1.8mm 1mm;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid}
.l svg{width:100%;height:9mm;display:block}
.l .qr-img{width:11mm;height:11mm;display:block;margin:0 auto;object-fit:contain}
.t{font-size:6.5pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin-bottom:.5mm}
.c{font-family:"Courier New",monospace;font-size:7.5pt;font-weight:700;letter-spacing:.3px;margin-top:.5mm}
.s{font-size:6pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
</style></head><body><div class="g">${cells.join("")}</div></body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();

  const go = () => {
    const w = frame.contentWindow;
    const done = () => frame.remove();
    w.addEventListener("afterprint", done, { once: true });
    setTimeout(done, 120000);
    w.focus();
    w.print();
  };

  if (doc.readyState === "complete") setTimeout(go, 50); else frame.onload = go;
  return true;
}
