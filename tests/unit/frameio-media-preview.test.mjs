import assert from "node:assert/strict";
import test from "node:test";
import {
  frameioOriginalPreviewKind,
  frameioThumbnailLink,
  mediaThumbRenderKind,
} from "../../src/lib/frameio-media-preview.ts";

test("Frame.io thumbnail link is read from url, inline_url or download_url", () => {
  assert.equal(frameioThumbnailLink({ thumbnail: { url: "https://a.example/t.jpg" } }), "https://a.example/t.jpg");
  assert.equal(frameioThumbnailLink({ thumbnail: { url: null, inline_url: "https://a.example/i.jpg" } }), "https://a.example/i.jpg");
  assert.equal(frameioThumbnailLink({ thumbnail: { download_url: "https://a.example/d.jpg" } }), "https://a.example/d.jpg");
});

test("missing or non-https Frame.io thumbnail links return null", () => {
  assert.equal(frameioThumbnailLink(null), null);
  assert.equal(frameioThumbnailLink({}), null);
  assert.equal(frameioThumbnailLink({ thumbnail: null }), null);
  assert.equal(frameioThumbnailLink({ thumbnail: { url: "javascript:alert(1)" } }), null);
  assert.equal(frameioThumbnailLink({ thumbnail: { url: "http://a.example/t.jpg" } }), null);
});

test("a Frame.io poster for a MOV video renders as an image, not a video", () => {
  assert.equal(
    mediaThumbRenderKind({ url: "https://a.example/t.jpg", sourceProvider: "frameio", mimeType: "video/quicktime", previewKind: "image" }),
    "image",
  );
});

test("a Frame.io video fallback renders as video", () => {
  assert.equal(
    mediaThumbRenderKind({ url: "https://a.example/v.mov", sourceProvider: "frameio", mimeType: "video/quicktime", previewKind: "video" }),
    "video",
  );
});

test("a Frame.io asset with no fresh preview kind shows the filename placeholder", () => {
  assert.equal(mediaThumbRenderKind({ url: "https://a.example/x", sourceProvider: "frameio", mimeType: "video/quicktime" }), "placeholder");
  assert.equal(mediaThumbRenderKind({ url: null, sourceProvider: "frameio", mimeType: "video/quicktime", previewKind: "image" }), "placeholder");
});

test("a preview that failed to load falls back to the placeholder", () => {
  assert.equal(
    mediaThumbRenderKind({ url: "https://a.example/t.jpg", failed: true, sourceProvider: "frameio", mimeType: "image/png", previewKind: "image" }),
    "placeholder",
  );
});

test("WaveOS and Drive media keep their existing renderer choice", () => {
  assert.equal(mediaThumbRenderKind({ url: "https://s/x.mp4", sourceProvider: "waveos", mimeType: "video/mp4" }), "video");
  assert.equal(mediaThumbRenderKind({ url: "https://s/x.jpg", sourceProvider: "waveos", mimeType: "image/jpeg" }), "image");
  assert.equal(mediaThumbRenderKind({ url: "https://d/x", sourceProvider: "google_drive", mimeType: "video/mp4" }), "image");
});

test("original-file fallback kind follows the file type", () => {
  assert.equal(frameioOriginalPreviewKind("video/quicktime"), "video");
  assert.equal(frameioOriginalPreviewKind("image/png"), "image");
  assert.equal(frameioOriginalPreviewKind("application/pdf"), null);
});
