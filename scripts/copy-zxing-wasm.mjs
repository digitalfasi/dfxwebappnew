// New Sale's camera barcode reader (barcode-detector -> zxing-wasm) loads its
// WebAssembly file from this site, never a CDN. Copied from the installed
// package before every dev/build so it always matches the library version.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", "public/zxing_reader.wasm");
