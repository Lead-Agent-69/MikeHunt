# Visual Design Guidelines

## The "Premium Visor" Rule
When requested to upgrade the UI or apply an aesthetic like "visor.vin", **DO NOT downgrade the UI to a flat, retro 90s terminal**. 

The application must always retain its high-end, premium Next.js SaaS aesthetic. This means:
1. **Never Remove Glassmorphism:** Keep the `backdrop-filter: blur(24px)` glass panels and floating drop shadows. They create depth.
2. **Never Flatten the UI:** Do not switch to rigid 1px borders and pure black backgrounds. Maintain the sophisticated, multi-layered OLED/Charcoal background palettes.
3. **Keep the "WOW" Factor:** Use vibrant gradients, subtle micro-animations, and rich visual cues. "Trading Terminal" means **fast response times and dense data structures**, NOT an ugly UI.

**Implementation Strategy:** Combine dense, monospace data grids (for speed and precision) with glowing neon accents and glass wrappers (for the premium WOW factor).
