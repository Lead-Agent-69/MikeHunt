export interface ExtractedOptions {
  drivetrain: "AWD" | "4WD" | "FWD" | "RWD" | "Unknown";
  transmission: "Automatic" | "Manual" | "Unknown";
  fuelType: "Gas" | "Diesel" | "Hybrid" | "Electric" | "Unknown";
  features: string[];
}

export function extractOptions(text?: string | null): ExtractedOptions {
  const result: ExtractedOptions = {
    drivetrain: "Unknown",
    transmission: "Unknown",
    fuelType: "Unknown",
    features: [],
  };

  if (!text) return result;

  const lowerText = text.toLowerCase();

  // Drivetrain
  if (
    lowerText.match(
      /\b(awd|all wheel drive|all-wheel drive|4motion|quattro|xdrive|sh-awd)\b/,
    )
  ) {
    result.drivetrain = "AWD";
  } else if (
    lowerText.match(/\b(4wd|4x4|four wheel drive|four-wheel drive)\b/)
  ) {
    result.drivetrain = "4WD";
  } else if (lowerText.match(/\b(fwd|front wheel drive|front-wheel drive)\b/)) {
    result.drivetrain = "FWD";
  } else if (lowerText.match(/\b(rwd|rear wheel drive|rear-wheel drive)\b/)) {
    result.drivetrain = "RWD";
  }

  // Transmission
  if (lowerText.match(/\b(manual|mt|stick|6-speed manual|5-speed manual)\b/)) {
    result.transmission = "Manual";
  } else if (lowerText.match(/\b(automatic|auto|at|cvt|dsg|pdk)\b/)) {
    result.transmission = "Automatic";
  }

  // Fuel Type
  if (lowerText.match(/\b(diesel|tdi|powerstroke|cummins|duramax)\b/)) {
    result.fuelType = "Diesel";
  } else if (lowerText.match(/\b(hybrid|phev)\b/)) {
    result.fuelType = "Hybrid";
  } else if (lowerText.match(/\b(electric|ev)\b/)) {
    result.fuelType = "Electric";
  } else if (lowerText.match(/\b(gas|gasoline|unleaded|v6|v8|4-cyl)\b/)) {
    result.fuelType = "Gas";
  }

  // Features
  const featurePatterns: Record<string, RegExp> = {
    "Sunroof/Moonroof": /\b(sunroof|moonroof|panoramic roof)\b/,
    "Leather Seats": /\b(leather|leather seats)\b/,
    Navigation: /\b(nav|navigation|gps)\b/,
    "Heated Seats": /\b(heated seats)\b/,
    "Backup Camera": /\b(backup camera|rear camera|rearview camera)\b/,
    Bluetooth: /\b(bluetooth)\b/,
    "Alloy Wheels": /\b(alloy|alloys)\b/,
    "Third Row Seating": /\b(3rd row|third row)\b/,
  };

  for (const [feature, pattern] of Object.entries(featurePatterns)) {
    if (pattern.test(lowerText)) {
      result.features.push(feature);
    }
  }

  return result;
}
