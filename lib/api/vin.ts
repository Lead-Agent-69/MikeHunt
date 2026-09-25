export interface Recall {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  reportReceivedDate: string;
}

export interface VINData {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyClass: string;
  driveType: string;
  engine: string;
  cylinders: string;
  displacement: string;
  fuelType: string;
  transmission: string;
  gvwr: string;
  plantCountry: string;
  recalls: Recall[];
  recallCount: number;
  safetyRating: string;
  complaints: {
    total: number;
    crashes: number;
    fires: number;
    injuries: number;
  };
  mpgCity: number;
  mpgHwy: number;
  mpgCombined: number;
  annualFuelCost: number;
  photos: string[];
  source: string;
}

export async function decodeVIN(vin: string): Promise<VINData | null> {
  if (!vin || vin.length !== 17) return null;

  try {
    // PRIMARY: mcp.vin — aggregates 6 free sources into one call
    const res = await fetch(`https://mcp.vin/api/vin/${vin.toUpperCase()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 }, // Cache 24 hours per VIN
    });

    if (res.ok) {
      const data = await res.json();
      return {
        vin,
        year: data.nhtsa?.modelYear || data.nhtsa?.year || "",
        make: data.nhtsa?.make || "",
        model: data.nhtsa?.model || "",
        trim: data.nhtsa?.trim || "",
        bodyClass: data.nhtsa?.bodyClass || "",
        driveType: data.nhtsa?.driveType || "",
        engine: `${data.nhtsa?.engineCylinders}cyl ${data.nhtsa?.displacementL}L`,
        cylinders: data.nhtsa?.engineCylinders || "",
        displacement: data.nhtsa?.displacementL || "",
        fuelType: data.nhtsa?.fuelType || "",
        transmission: data.nhtsa?.transmissionStyle || "",
        gvwr: data.nhtsa?.gvwr || "",
        plantCountry: data.nhtsa?.plantCountry || "",
        recalls: data.recalls || [],
        recallCount: (data.recalls || []).length,
        safetyRating: data.safetyRatings?.overallRating || "",
        complaints: data.complaints || {
          total: 0,
          crashes: 0,
          fires: 0,
          injuries: 0,
        },
        mpgCity: data.fuelEconomy?.city || 0,
        mpgHwy: data.fuelEconomy?.highway || 0,
        mpgCombined: data.fuelEconomy?.combined || 0,
        annualFuelCost: data.fuelEconomy?.annualFuelCost || 0,
        photos: data.photos || [],
        source: "mcp.vin",
      };
    }
  } catch {}

  // FALLBACK 1: Direct NHTSA vPIC (always available, 100+ fields)
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`,
      { next: { revalidate: 86400 } },
    );
    const data = await res.json();
    const r = data.Results?.[0];

    if (r && r.ErrorCode === "0") {
      // Also fetch recalls separately
      const recalls = await fetchNHTSARecalls(r.ModelYear, r.Make, r.Model);

      return {
        vin,
        year: r.ModelYear,
        make: r.Make,
        model: r.Model,
        trim: r.Trim,
        bodyClass: r.BodyClass,
        driveType: r.DriveType,
        engine: `${r.EngineCylinders}cyl ${r.DisplacementL}L`,
        cylinders: r.EngineCylinders,
        displacement: r.DisplacementL,
        fuelType: r.FuelTypePrimary,
        transmission: r.TransmissionStyle,
        gvwr: r.GVWR,
        plantCountry: r.PlantCountry,
        recalls,
        recallCount: recalls.length,
        safetyRating: "", // Fetch separately if needed
        complaints: { total: 0, crashes: 0, fires: 0, injuries: 0 },
        mpgCity: 0,
        mpgHwy: 0,
        mpgCombined: 0,
        annualFuelCost: 0,
        photos: [],
        source: "nhtsa",
      };
    }
  } catch {}

  // FALLBACK 2: Cardog API (100 free/month, TypeScript SDK)
  if (process.env.CARDOG_API_KEY) {
    try {
      const res = await fetch(`https://api.cardog.app/vin/${vin}`, {
        headers: { Authorization: `Bearer ${process.env.CARDOG_API_KEY}` },
      });
      if (res.ok) {
        const data = await res.json();
        return { ...data, source: "cardog" } as VINData;
      }
    } catch {}
  }

  return null;
}

async function fetchNHTSARecalls(year: string, make: string, model: string) {
  try {
    const res = await fetch(
      `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`,
      { next: { revalidate: 3600 } },
    );
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

export async function fetchEPAFuelEconomy(
  year: string,
  make: string,
  model: string,
) {
  try {
    const res = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${make}&model=${model}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 86400 } },
    );
    return await res.json();
  } catch {
    return null;
  }
}

export async function batchDecodeVINs(vins: string[]) {
  const chunks = [];
  for (let i = 0; i < vins.length; i += 50) {
    chunks.push(vins.slice(i, i + 50));
  }

  const results = [];
  for (const chunk of chunks) {
    try {
      const res = await fetch("https://mcp.vin/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vins: chunk }),
      });
      if (res.ok) {
        const data = await res.json();
        results.push(...data);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

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
