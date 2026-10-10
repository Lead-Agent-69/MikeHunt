// Camera VIN scan for the lane page (client-only). Moved out of the deleted lib/api/vin.ts, whose
// mcp.vin/NHTSA/EPA client fetchers were unused (VIN decode now goes through /api/vin and
// lib/vehicle/vin-enrichment).

export async function scanVINFromCamera(
  videoElementId = "video-preview",
): Promise<string | null> {
  if (!("BarcodeDetector" in window)) {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const video = document.getElementById(videoElementId) as HTMLVideoElement;
      if (!video) return null;

      const result = await reader.decodeOnceFromVideoElement(video);
      return result.getText();
    } catch {
      return null;
    }
  }

  const detector = new (window as any).BarcodeDetector({
    formats: ["code_39", "code_128", "qr_code", "data_matrix"],
  });
  const video = document.getElementById(videoElementId) as HTMLVideoElement;
  if (!video) return null;

  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const scanFrame = async () => {
      // If video is removed from DOM or stopped, abort scanning
      if (
        !document.getElementById(videoElementId) ||
        video.paused ||
        video.ended
      ) {
        return resolve(null);
      }

      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const barcodes = await detector.detect(canvas);
          const vin = barcodes.find(
            (b: any) => b.rawValue?.length === 17,
          )?.rawValue;
          if (vin) return resolve(vin);
        } catch {
          // Ignore transient detection errors
        }
      }

      requestAnimationFrame(scanFrame);
    };
    scanFrame();
  });
}
