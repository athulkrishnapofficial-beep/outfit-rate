import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelStatus, setModelStatus] = useState("Loading models…");

  const canvasRef = useRef(null);
  const imgElRef = useRef(null);

  // ML models
  const bodyPixRef = useRef(null);
  const cocoRef = useRef(null);

  // -------- Utils
  const toHex = (r, g, b) =>
    "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: h = 0;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  };

  const hslToRgb = (h, s, l) => {
    h /= 360; s /= 100; l /= 100;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };

  const complementaryColor = (rgb) => {
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hc = (h + 180) % 360;
    const { r, g, b } = hslToRgb(hc, s, l);
    return toHex(r, g, b);
  };

  const analogousColors = (rgb) => {
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const a1 = (h + 30) % 360;
    const a2 = (h + 330) % 360;
    const c1 = hslToRgb(a1, s, l);
    const c2 = hslToRgb(a2, s, l);
    return [toHex(c1.r, c1.g, c1.b), toHex(c2.r, c2.g, c2.b)];
  };

  // fast quantization key
  const qkey = (r, g, b) => `${r >> 4},${g >> 4},${b >> 4}`; // 0..15 per channel

  // Compute color stats inside an optional binary mask
  const computeStats = (imageData, mask) => {
    const { data, width, height } = imageData;
    let pxCount = 0;
    let sumR = 0, sumG = 0, sumB = 0, sumL = 0;
    let minL = 255, maxL = 0;
    let veryDark = 0, veryLight = 0;
    const buckets = new Map();

    const useMask = !!mask;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (useMask && !mask[idx + 3]) continue; // mask alpha 0 -> skip
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sumR += r; sumG += g; sumB += b; sumL += l;
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
        if (l < 30) veryDark++;
        if (l > 225) veryLight++;
        const key = qkey(r, g, b);
        buckets.set(key, (buckets.get(key) || 0) + 1);
        pxCount++;
      }
    }

    if (pxCount === 0) return null;

    const top = [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const [rq, gq, bq] = key.split(",").map(Number);
        const r = rq * 16 + 8, g = gq * 16 + 8, b = bq * 16 + 8;
        return { rgb: { r, g, b }, hex: toHex(r, g, b), ratio: count / pxCount };
      });

    const avgR = sumR / pxCount;
    const avgG = sumG / pxCount;
    const avgB = sumB / pxCount;
    const avgHex = toHex(Math.round(avgR), Math.round(avgG), Math.round(avgB));
    const contrast = maxL - minL;

    const exposureHint =
      veryLight / pxCount > 0.25 ? "slightly over-exposed" :
      veryDark / pxCount > 0.25 ? "slightly under-exposed" :
      "balanced exposure";

    const { s: avgS, l: avgL } = rgbToHsl(avgR, avgG, avgB);
    let vibe = "clean & minimal";
    if (avgS > 45 && avgL > 60) vibe = "vibrant & playful";
    else if (avgS < 20 && contrast > 140) vibe = "classic & sharp";
    else if (avgL < 35) vibe = "moody & bold";

    const base = top[0]?.rgb ?? { r: 120, g: 120, b: 120 };
    const comp = complementaryColor(base);
    const [ana1, ana2] = analogousColors(base);

    return {
      pxCount,
      avgHex,
      dominant: top,
      contrast: Math.round(contrast),
      exposureHint,
      vibe,
      colorSuggestions: { complementary: comp, analogous: [ana1, ana2] },
    };
  };

  const buildMarkdown = ({ globalStats, topStats, bottomStats, cocoFindings }, userPrompt) => {
    const domToStr = (st) => st?.dominant?.map((c) => `\`${c.hex}\` (${Math.round(c.ratio * 100)}%)`).join(", ") || "-";

    const accessories = cocoFindings.length
      ? cocoFindings.map((d) => `- **${d.class}** (${Math.round(d.score * 100)}%)`).join("\n")
      : "- None detected (try clearer photo or different angle)";

    return `### 🌟 Overall Vibe
${globalStats.vibe}. Context: *${userPrompt}*. Exposure looks **${globalStats.exposureHint}**.

### 🎨 Color & Palette (Whole Look)
- Average tone: **${globalStats.avgHex}**
- Dominant swatches: ${domToStr(globalStats)}
- Try these pops/accents:
  - **Complementary:** ${globalStats.colorSuggestions.complementary}
  - **Analogous:** ${globalStats.colorSuggestions.analogous.join(", ")}

### 🧥 Garment Analysis (from segmentation)
- **Top (upper body):**
  - Dominants: ${domToStr(topStats)}
  - Contrast: ${topStats?.contrast ?? "-"}
  - Vibe: ${topStats?.vibe ?? "-"}
- **Bottom (lower body):**
  - Dominants: ${domToStr(bottomStats)}
  - Contrast: ${bottomStats?.contrast ?? "-"}
  - Vibe: ${bottomStats?.vibe ?? "-"}

**Styling hints:**
- If top and bottom look too similar, introduce micro-contrast with belt/shoes.
- Consider accent in ${globalStats.colorSuggestions.complementary} to balance the palette.

### 👜 Detected Accessories (COCO-SSD)
${accessories}

### ✅ Occasion Fit
${/interview|office|formal|presentation/i.test(userPrompt)
  ? (globalStats.contrast > 110 ? "Good for formal/semi-formal." : "Might need sharper contrast for formal.")
  : /date|party|casual|hangout/i.test(userPrompt)
  ? (globalStats.brightness > 90 ? "Great for casual/social settings." : "Add a lighter piece for approachability.")
  : "Versatile — tweak with layers/accessories."}
`;
  };

  // -------- Load models on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setModelStatus("Loading TensorFlow backend…");
        const tf = await import("@tensorflow/tfjs");
        // Let TF choose best backend (webgl/webgpu/cpu). You can force: await tf.setBackend('webgl'); // Pick best available backend with graceful fallback
let chosen = "";
for (const b of ["webgpu", "webgl", "cpu"]) {
  try { await tf.setBackend(b); await tf.ready(); chosen = b; break; } catch (_) {}
}
setModelStatus(`TensorFlow backend: ${chosen || 'cpu'}`);
        await tf.ready();

        setModelStatus("Loading BodyPix (person segmentation)…");
        const bodyPix = await import("@tensorflow-models/body-pix");
        const bp = await bodyPix.load({
          architecture: "MobileNetV1",
          outputStride: 16,
          multiplier: 0.75,
          quantBytes: 2,
        });

        setModelStatus("Loading COCO-SSD (object detection)…");
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        const coco = await cocoSsd.load({ base: "lite_mobilenet_v2" });

        if (!isMounted) return;
        bodyPixRef.current = bp;
        cocoRef.current = coco;
        setModelsLoading(false);
        setModelStatus("Models ready ✔");
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setModelStatus("Failed to load models. Check console.");
          setModelsLoading(false);
        }
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // -------- Handlers
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imagePreview) throw new Error("No image preview");

    // draw image to canvas (downscale for speed)
    const img = imgElRef.current;
    await new Promise((res) => {
      if (img.complete) res();
      else img.onload = () => res();
    });

    const MAX = 640; // bigger than heuristic-only version for better masks
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.floor(img.naturalWidth * scale));
    const h = Math.max(1, Math.floor(img.naturalHeight * scale));

    const canvas = canvasRef.current || document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);

    // 1) Person segmentation with BodyPix
    const bp = bodyPixRef.current;
    if (!bp) throw new Error("BodyPix not ready");

    const segmentation = await bp.segmentPerson(img, {
      internalResolution: "medium",
      segmentationThreshold: 0.7,
    });

    // Build mask ImageData (RGBA) from segmentation
    const mask = ctx.createImageData(w, h);
    for (let i = 0; i < segmentation.data.length; i++) {
      if (segmentation.data[i] === 1) { // person pixel
        mask.data[i * 4 + 3] = 255; // alpha on
      } else {
        mask.data[i * 4 + 3] = 0; // alpha off
      }
    }

    // Person bbox from mask
    let minX = w, minY = h, maxX = 0, maxY = 0, any = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = mask.data[(y * w + x) * 4 + 3];
        if (a) {
          any = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 2) Split upper/lower body by midline of bbox
    let topMask = null, bottomMask = null;
    if (any) {
      const midY = Math.floor((minY + maxY) / 2);
      topMask = ctx.createImageData(w, h);
      bottomMask = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const a = mask.data[idx + 3];
          if (!a) continue;
          if (y <= midY) topMask.data[idx + 3] = 255;
          else bottomMask.data[idx + 3] = 255;
        }
      }
    }

    // 3) Stats
    // Always compute global stats on full image (no mask)
const globalStats = computeStats(imageData, null);
    // Add some extra fields used by markdown template
    if (globalStats) {
      // brightness heuristic
      const { data } = imageData;
      let sumL = 0; let count = 0; let minL = 255; let maxL = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sumL += l; count++;
        if (l < minL) minL = l; if (l > maxL) maxL = l;
      }
      globalStats.brightness = Math.round(sumL / count);
      globalStats.contrast = Math.round(maxL - minL);
    }

    const topStats = topMask ? computeStats(imageData, topMask) : null;
    const bottomStats = bottomMask ? computeStats(imageData, bottomMask) : null;

    // 4) Object detection (accessories)
    const coco = cocoRef.current;
    if (!coco) throw new Error("COCO-SSD not ready");
    const detections = await coco.detect(img, 10);
    const interesting = [
      "tie", "backpack", "handbag", "umbrella", "suitcase",
      "sports ball", "skateboard", "bottle", "book", "cell phone", "laptop"
    ];
    const cocoFindings = detections
      .filter((d) => interesting.includes(d.class) && d.score > 0.45)
      .map((d) => ({ class: d.class, score: d.score }));

    return { globalStats, topStats, bottomStats, cocoFindings };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile || !prompt) {
      alert("Please upload an image and ask a question.");
      return;
    }
    setLoading(true);
    setResult("");

    try {
      const { globalStats, topStats, bottomStats, cocoFindings } = await analyze();
      const md = buildMarkdown({ globalStats, topStats, bottomStats, cocoFindings }, prompt);
      setResult(md);
    } catch (err) {
      console.error(err);
      setResult(`Error: ${err.message || "Could not analyze image."}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-4 md:p-10">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
            AI Fashion Advisor 
          </h1>
          <p className="text-gray-400 mt-2">How can I help you today?</p>
          <p className="text-sm text-gray-500 mt-1">{modelStatus}</p>
        </div>

        {/* Upload & Preview */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-lg font-semibold mb-3">1. Upload Your 'Fit</h2>
          <div
            className={`flex justify-center items-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer ${imagePreview ? "border-purple-400" : "border-gray-600 hover:border-gray-500"} bg-cover bg-center`}
            style={{ backgroundImage: `url(${imagePreview || ""})` }}
            onClick={() => document.getElementById("file-input").click()}
          >
            {!imagePreview && (
              <div className="text-center text-gray-400">
                <p>Click to upload an image</p>
                <p className="text-sm">(PNG, JPG, WEBP, HEIC/HEIF*)</p>
              </div>
            )}
          </div>
          <input
            id="file-input"
            type="file"
            accept="image/png, image/jpeg, image/webp, image/heic, image/heif"
            className="hidden"
            onChange={handleImageChange}
          />
          {/* Hidden img element ensures naturalWidth/Height are available */}
          <img ref={imgElRef} src={imagePreview} alt="preview" className="hidden" />
          <canvas ref={canvasRef} className="hidden" />
          <p className="text-xs text-gray-500 mt-2">
            *Note: HEIC/HEIF preview support depends on browser. If preview doesn't show, convert to JPG/PNG.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6">
            <label htmlFor="prompt" className="text-lg font-semibold mb-3 block">2. Ask Your Question</label>
            <input
              id="prompt"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., How is this for a date?"
              className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || modelsLoading || !imageFile || !prompt}
            className="w-full text-lg font-bold p-4 rounded-lg shadow-lg flex justify-center items-center bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
            ) : modelsLoading ? (
              "Loading ML Models…"
            ) : (
              "Analyze My Outfit"
            )}
          </button>
        </form>

        {/* Result */}
        {(loading || result) && (
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg mt-8">
            <h2 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
              Analysis
            </h2>
            {loading ? (
              <div className="flex justify-center items-center h-24">
                <div className="w-8 h-8 border-4 border-t-transparent border-purple-400 rounded-full animate-spin"></div>
                <p className="ml-3 text-gray-400">AI is thinking…</p>
              </div>
            ) : (
              <ReactMarkdown>{result}</ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
