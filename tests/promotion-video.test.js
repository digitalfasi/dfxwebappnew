/**
 * Promotion banner video — web admin.
 *
 * uploadWithProgress is exercised for real against a fake XMLHttpRequest
 * (progress, 401 -> one refresh -> retry, readable failures). The form and the
 * list are checked at source level, the same way the other form-rule tests
 * here do, for the rules the backend relies on: limits that match the server,
 * a record that is never activated before its files exist, and a list that
 * tells images and videos apart.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const form = read("src/modules/marketing/PromotionCreate.jsx");
const list = read("src/modules/marketing/PromotionBanners.jsx");
const service = read("src/modules/marketing/promotionService.js");

const KEYS = { access: "jros_access_token", refresh: "jros_refresh_token" };

function installStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  globalThis.window = globalThis.window || { dispatchEvent() {}, addEventListener() {} };
  if (!globalThis.crypto?.getRandomValues) {
    const { webcrypto } = require("node:crypto");
    globalThis.crypto = webcrypto;
  }
  return map;
}

/** Scripted XHR: each send() consumes the next response in `script`. */
function installXhr(script) {
  const sent = [];
  class FakeXhr {
    constructor() { this.headers = {}; this.upload = {}; this.status = 0; this.responseText = ""; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    abort() { this.onabort?.(); }
    send(body) {
      sent.push({ url: this.url, auth: this.headers.Authorization, body });
      const step = script.shift();
      setTimeout(() => {
        if (step.network) { this.onerror?.(); return; }
        if (step.timeout) { this.ontimeout?.(); return; }
        (step.progress || []).forEach((loaded) => this.upload.onprogress?.({ lengthComputable: true, loaded, total: 100 }));
        this.status = step.status;
        this.responseText = JSON.stringify(step.body ?? {});
        this.onload?.();
      }, 0);
    }
  }
  globalThis.XMLHttpRequest = FakeXhr;
  return sent;
}

async function loadClient() {
  vi.resetModules();
  return await import("../src/_shared/apiClient.js");
}

describe("uploadWithProgress", () => {
  let store;
  beforeEach(() => {
    store = installStorage();
    store.set(KEYS.access, "A1");
    store.set(KEYS.refresh, "R1");
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("reports progress and returns the parsed body", async () => {
    installXhr([{ status: 200, progress: [10, 55, 100], body: { success: true, data: { ok: 1 } } }]);
    const { uploadWithProgress } = await loadClient();
    const seen = [];
    const res = await uploadWithProgress("/admin/promotions/p1/video", new FormData(), { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([10, 55, 100]);
    expect(res.data.ok).toBe(1);
  });

  it("sends the bearer token", async () => {
    const sent = installXhr([{ status: 200, body: {} }]);
    const { uploadWithProgress } = await loadClient();
    await uploadWithProgress("/x", new FormData());
    expect(sent[0].auth).toBe("Bearer A1");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    const sent = installXhr([
      { status: 401, body: { message: "expired" } },
      { status: 200, body: { success: true, data: { retried: true } } },
    ]);
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ success: true, data: { access_token: "A2", refresh_token: "R2" } }),
    }));
    const { uploadWithProgress } = await loadClient();
    const res = await uploadWithProgress("/x", new FormData());
    expect(res.data.retried).toBe(true);
    expect(sent.map((s) => s.auth)).toEqual(["Bearer A1", "Bearer A2"]);
  });

  it("surfaces the server's validation message", async () => {
    installXhr([{ status: 400, body: { success: false, errors: [{ message: "This video uses HEVC (H.265)" }] } }]);
    const { uploadWithProgress } = await loadClient();
    await expect(uploadWithProgress("/x", new FormData())).rejects.toThrow(/HEVC/);
  });

  it("explains a 413 from the proxy in plain words", async () => {
    installXhr([{ status: 413, body: null }]);
    const { uploadWithProgress } = await loadClient();
    await expect(uploadWithProgress("/x", new FormData())).rejects.toThrow(/larger than the server accepts/);
  });

  it("reports a dropped connection and a timeout distinctly", async () => {
    installXhr([{ network: true }, { timeout: true }]);
    const { uploadWithProgress } = await loadClient();
    await expect(uploadWithProgress("/x", new FormData())).rejects.toThrow(/connection .* was lost/);
    await expect(uploadWithProgress("/x", new FormData())).rejects.toThrow(/took too long/);
  });

  it("refuses without a session instead of sending anonymously", async () => {
    store.delete(KEYS.access);
    const sent = installXhr([]);
    const { uploadWithProgress } = await loadClient();
    await expect(uploadWithProgress("/x", new FormData())).rejects.toThrow(/session has expired/);
    expect(sent).toHaveLength(0);
  });
});

describe("promotion service contract", () => {
  it("treats rows without media_type as images", () => {
    expect(service).toMatch(/mediaType:\s*raw\.media_type \?\? "IMAGE"/);
  });
  it("sends media_type and uploads video to its own endpoint with a long timeout", () => {
    expect(service).toMatch(/b\.media_type = data\.mediaType/);
    expect(service).toMatch(/\/admin\/promotions\/\$\{id\}\/video/);
    expect(service).toMatch(/timeoutMs:\s*10 \* 60 \* 1000/);
  });
});

describe("active window dates", () => {
  it("are normalised to YYYY-MM-DD so status and the edit form read them correctly", () => {
    expect(service).toMatch(/startDate: toDateOnly\(raw\.start_date\)/);
    expect(service).toMatch(/endDate: toDateOnly\(raw\.end_date\)/);
    const src = service.slice(service.indexOf("function toDateOnly"), service.indexOf("/** GET /admin/promotions item"));
    const toDateOnly = new Function(`return ${src.trim()}`)();
    expect(toDateOnly("2026-09-23T00:00:00Z")).toBe("2026-09-23");
    expect(toDateOnly("2026-09-23")).toBe("2026-09-23");
    expect(toDateOnly(null)).toBe(null);
    expect("2026-09-23" < toDateOnly("2026-09-23T00:00:00Z")).toBe(false);
  });
});

describe("banner form rules match the backend", () => {
  it("video limit is 20 MB, MP4 only; image limit 10 MB, JPEG/PNG/WebP", () => {
    expect(form).toMatch(/VIDEO: \{ bytes: 20 \* 1024 \* 1024, accept: "video\/mp4"/);
    expect(form).toMatch(/IMAGE: \{ bytes: 10 \* 1024 \* 1024, accept: "image\/jpeg,image\/png,image\/webp"/);
    expect(form).toMatch(/IMAGE_TYPES = \["image\/jpeg", "image\/png", "image\/webp"\]/);
  });
  it("stages the record inactive and activates only when the file is present", () => {
    expect(form).toMatch(/isActive: false,\s*\n\s*};/);
    expect(form).toMatch(/if \(form\.active && fileOk\)/);
  });
  it("a video banner needs only its video — no poster or image field", () => {
    expect(form).not.toMatch(/poster/i);
    expect(form).toMatch(/Choose a video\./);
  });
  it("previews in the app banner's shape (1.22 : 1) with the app's crop", () => {
    expect(form).toMatch(/const BANNER_RATIO = 1\.22;/);
    expect(form).toMatch(/aspectRatio: BANNER_RATIO/);
    expect(form).toMatch(/object-cover/);
    expect(form).not.toMatch(/object-contain/);
    expect(form).toMatch(/Best size 1220 × 1000 px/);
  });
  it("keeps the admin preview silent", () => {
    const tag = form.slice(form.indexOf("<video"), form.indexOf("/>", form.indexOf("<video")));
    expect(tag).toMatch(/\bmuted\b/);
    expect(tag).not.toMatch(/\bautoPlay\b/);
  });
  it("stays on the saved draft when an upload fails", () => {
    expect(form).toMatch(/setEditingPromo\(record\);/);
    expect(form).toMatch(/setErrors\(failures\)/);
  });
});

describe("banner list", () => {
  it("labels each row Image or Video and shows its picture", () => {
    expect(list).toMatch(/p\.mediaType === "VIDEO" \? "Video" : "Image"/);
    expect(list).toMatch(/<MediaThumb p=\{p\} \/>/);
  });
  it("asks before deleting", () => {
    expect(list).toMatch(/Confirm delete/);
  });
});
