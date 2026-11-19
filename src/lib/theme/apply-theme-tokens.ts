import type { AppSettings } from "@/types/models";

const surfaceColors = {
  obsidian: "#070709",
  "pure-black": "#000000",
  "slate-dark": "#0B0E14",
} as const;

const radiusValues = {
  sharp: { card: "8px", control: "6px" },
  balanced: { card: "12px", control: "10px" },
  organic: { card: "16px", control: "12px" },
} as const;

const glowValues = {
  none: "0",
  subtle: "0.14",
  vivid: "0.26",
} as const;

function relativeLuminance(hexColor: string): number {
  const normalized = hexColor.replace("#", "");
  const channels = normalized.length === 3
    ? normalized.split("").map((channel) => Number.parseInt(channel + channel, 16))
    : [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function applyThemeTokens(settings: AppSettings): void {
  const root = document.documentElement.style;
  if (settings.themePreset === "runtime-brutal") {
    document.documentElement.dataset.theme = "runtime-brutal";
    document.documentElement.dataset.density = settings.density ?? "comfortable";
    const tokens: Record<string, string> = {
      "--bg-primary": "#000000",
      "--bg-surface": "#070708",
      "--bg-elevated": "#0E100E",
      "--bg-card-hover": "#141714",
      "--border-subtle": "#1F241F",
      "--border-highlight": "#364234",
      "--accent-color": "#D9F99D",
      "--accent-foreground": "#09090B",
      "--accent-hover": "#E5FBB3",
      "--accent-muted": "rgba(217, 249, 157, 0.16)",
      "--accent-glow": "rgba(217, 249, 157, 0.5)",
      "--radius-card": "2px",
      "--radius-control": "2px",
      "--glow-opacity": "0.14",
      "--font-body-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
      "--font-heading-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    };
    for (const [key, value] of Object.entries(tokens)) root.setProperty(key, value);
    return;
  }
  document.documentElement.dataset.theme = settings.themePreset ?? "custom";
  const accent = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(settings.accentColor)
    ? settings.accentColor
    : "#A3E635";
  const luminance = relativeLuminance(accent);
  const foreground = luminance > 0.179 ? "#09090B" : "#FAFAFA";
  const radii = radiusValues[settings.borderRadius ?? "organic"];
  const surface = surfaceColors[settings.surfaceStyle ?? "obsidian"];
  const glow = glowValues[settings.glowIntensity ?? "subtle"];
  document.documentElement.dataset.density = settings.density ?? "comfortable";
  const bodyFont = settings.fontFamily === "serif"
    ? "Iowan Old Style, Baskerville, Georgia, serif"
    : settings.fontFamily === "mono"
      ? "ui-monospace, SFMono-Regular, Menlo, monospace"
      : "var(--font-sans), ui-sans-serif, sans-serif";

  root.setProperty("--bg-primary", surface);
  root.setProperty("--bg-surface", "#0D0D10");
  root.setProperty("--bg-elevated", "#131317");
  root.setProperty("--bg-card-hover", "#18181D");
  root.setProperty("--border-subtle", "rgba(255, 255, 255, 0.08)");
  root.setProperty("--border-highlight", "rgba(255, 255, 255, 0.14)");
  root.setProperty("--accent-color", accent);
  root.setProperty("--accent-foreground", foreground);
  root.setProperty("--accent-hover", `color-mix(in srgb, ${accent} 84%, white)`);
  root.setProperty("--accent-muted", `color-mix(in srgb, ${accent} 16%, transparent)`);
  root.setProperty("--accent-glow", `color-mix(in srgb, ${accent} 50%, transparent)`);
  root.setProperty("--radius-card", radii.card);
  root.setProperty("--radius-control", radii.control);
  root.setProperty("--glow-opacity", glow);
  root.setProperty("--font-body-family", bodyFont);
  root.setProperty(
    "--font-heading-family",
    settings.headingStyle === "editorial-serif"
      ? "Iowan Old Style, Baskerville, Georgia, serif"
      : "var(--font-sans), ui-sans-serif, sans-serif",
  );
}
