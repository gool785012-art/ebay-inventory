// アップロード前に写真をブラウザ側で縮小する共通関数
//
// スマホで撮影した写真は1枚数MBあり、表示のたびに元サイズが送信されて
// Supabase の送信データ量（Egress）を大きく消費していた。
// 長辺を MAX_EDGE に収め JPEG に再圧縮してから保存することで、
// 1枚あたりのサイズを数百KBまで下げる。

/** 長辺の上限（px）。商品の傷や型番が読める解像度を保つ */
export const MAX_EDGE = 1600;
/** JPEG品質（0〜1） */
export const JPEG_QUALITY = 0.82;
/** これ以下の大きさなら再圧縮せずそのまま使う（byte） */
const SKIP_BELOW_BYTES = 300 * 1024;

/** 縮小後の縦横を求める（拡大はしない。縦横比は保つ） */
export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// 縮小しない形式（アニメーションやベクター画像を壊さないため）
function isResizable(file: File): boolean {
  return file.type.startsWith("image/") && !/(gif|svg)/i.test(file.type);
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // EXIF の向きを反映して読み込む（縦撮り写真が横倒しになるのを防ぐ）
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // 下の <img> 方式へフォールバック
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
  return { canvas, ctx };
}

/**
 * 画像を目的の大きさに描画したキャンバスを返す。
 * - 一度に大きく縮めると細い線や文字（型番・シリアル）が潰れやすいため、
 *   目的サイズの2倍を下回るまで半分ずつ縮めてから最後に合わせる。
 * - JPEG は透明を持てず、透明部分が黒になってしまうため、
 *   先に白で塗ってから描画する（PNG のスクリーンショット等への対策）。
 */
function drawScaled(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): HTMLCanvasElement | null {
  let current: CanvasImageSource = source;
  let curW = srcW;
  let curH = srcH;

  while (curW / 2 >= dstW && curH / 2 >= dstH) {
    const nextW = Math.round(curW / 2);
    const nextH = Math.round(curH / 2);
    const step = makeCanvas(nextW, nextH);
    if (!step.ctx) return null;
    step.ctx.drawImage(current, 0, 0, nextW, nextH);
    current = step.canvas;
    curW = nextW;
    curH = nextH;
  }

  const out = makeCanvas(dstW, dstH);
  if (!out.ctx) return null;
  out.ctx.fillStyle = "#ffffff";
  out.ctx.fillRect(0, 0, dstW, dstH);
  out.ctx.drawImage(current, 0, 0, dstW, dstH);
  return out.canvas;
}

/**
 * 写真を縮小して返す。縮小できない・効果がない場合は元のファイルをそのまま返す
 * （アップロード自体は止めない）。
 */
export async function resizeImage(file: File): Promise<File> {
  if (!isResizable(file)) return file;

  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return file; // 読み込めない形式は元のまま
  }

  try {
    const { width, height } = computeTargetSize(decoded.width, decoded.height);
    const needsResize = width !== decoded.width || height !== decoded.height;

    // すでに小さい写真は再圧縮で劣化させない
    if (!needsResize && file.size <= SKIP_BELOW_BYTES) return file;

    const canvas = drawScaled(decoded.source, decoded.width, decoded.height, width, height);
    if (!canvas) return file;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    // 縮小したのに大きくなった場合は元のファイルを使う
    if (!needsResize && blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    decoded.close();
  }
}
