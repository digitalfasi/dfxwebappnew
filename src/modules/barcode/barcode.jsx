"use client";
// Code 128 barcodes for stock pieces. The barcode carries exactly what New Sale
// looks a piece up by: its Item Code (a HUID piece's Item Code IS its HUID) or
// a raw-gold bar's Serial Number. A USB / phone scanner "types" that code and
// presses Enter, so a scan lands on the same lookup a cashier types into.
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// What a piece's barcode encodes. Upper-cased and stripped like the server
// stores codes, so the printed value always matches the saved one.
export function barcodeValueOf(item) {
  const v = item?.serial_number || item?.product_code || item?.huid || "";
  return String(v).trim().toUpperCase();
}

function drawInto(svg, value, { height, width }) {
  JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 0, height, width, background: "transparent" });
}

// On-screen barcode. Renders nothing for an empty value.
export function Barcode({ value, height = 34, width = 1.4, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try { drawInto(ref.current, value, { height, width }); } catch { /* value not encodable */ }
  }, [value, height, width]);
  if (!value) return null;
  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Prints labels on a standard A4 sheet of 65 stickers (5 x 13, 38.1 x 21.2 mm,
// the common "A4 65 labels" stationery sheet). labels: [{ value, title, line }].
// Printed from a hidden frame, so no pop-up blocker gets in the way.
export function printBarcodeLabels(labels) {
  const list = (labels || []).filter((l) => l?.value);
  if (!list.length) return false;
  const cells = list.map((l) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try { drawInto(svg, l.value, { height: 40, width: 2 }); } catch { return ""; }
    svg.setAttribute("preserveAspectRatio", "none");
    return `<div class="l"><div class="t">${esc(l.title)}</div>${svg.outerHTML}<div class="c">${esc(l.value)}</div><div class="s">${esc(l.line)}</div></div>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Barcodes</title><style>
@page{size:A4;margin:10.7mm 4.65mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.g{display:grid;grid-template-columns:repeat(5,38.1mm);grid-auto-rows:21.2mm;column-gap:2.5mm}
.l{overflow:hidden;padding:1.2mm 1.8mm 1mm;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid}
.l svg{width:100%;height:9mm;display:block}
.t{font-size:6.5pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin-bottom:.5mm}
.c{font-family:"Courier New",monospace;font-size:7.5pt;font-weight:700;letter-spacing:.3px;margin-top:.5mm}
.s{font-size:6pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
</style></head><body><div class="g">${cells}</div></body></html>`;
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
    setTimeout(done, 120000); // safety net if a browser never fires afterprint
    w.focus();
    w.print();
  };
  if (doc.readyState === "complete") setTimeout(go, 50); else frame.onload = go;
  return true;
}
