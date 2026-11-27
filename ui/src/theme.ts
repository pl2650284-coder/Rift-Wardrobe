export type ThemeMode = "system" | "dark" | "light";
export const PRESET_ACCENTS = [
  { id: "blue", label: "默认清蓝", hex: "#5b7cfa" },
  { id: "mint", label: "薄荷青", hex: "#34c799" },
  { id: "gold", label: "暖砂金", hex: "#d6a856" },
  { id: "rose", label: "绯红莓", hex: "#e06c9f" },
] as const;

export function isPresetAccent(value: string): boolean {
  return PRESET_ACCENTS.some((item) => item.id === value);
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "dark" || mode === "light") return mode;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function mixRgb(a: [number, number, number], b: [number, number, number], ratio: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * ratio,
    a[1] + (b[1] - a[1]) * ratio,
    a[2] + (b[2] - a[2]) * ratio,
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function currentAccentHex(accent: string): string {
  if (isHexColor(accent)) return accent.toLowerCase();
  return PRESET_ACCENTS.find((item) => item.id === accent)?.hex ?? PRESET_ACCENTS[0].hex;
}

export function applyThemeAndAccent(root: HTMLElement, mode: ThemeMode, accent: string): "dark" | "light" {
  const resolved = resolveTheme(mode);
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;

  const customProps = ["--accent", "--accent-strong", "--accent-soft", "--accent-wash", "--accent-fg"];
  if (isPresetAccent(accent)) {
    root.dataset.accent = accent;
    for (const prop of customProps) root.style.removeProperty(prop);
    return resolved;
  }

  const baseHex = isHexColor(accent) ? accent.toLowerCase() : PRESET_ACCENTS[0].hex;
  const rawRgb = hexToRgb(baseHex);
  const darkSurface: [number, number, number] = [15, 17, 21];
  const lightSurface: [number, number, number] = [255, 255, 255];

  let adjusted = rawRgb;
  if (resolved === "dark") {
    // Ensure custom accent remains clearly legible on dark surfaces.
    let step = 0;
    while (contrastRatio(adjusted, darkSurface) < 4.5 && step < 12) {
      adjusted = mixRgb(adjusted, [242, 244, 248], 0.14);
      step += 1;
    }
  } else {
    // Ensure custom accent remains clearly legible on light surfaces.
    let step = 0;
    while (contrastRatio(adjusted, lightSurface) < 4.5 && step < 12) {
      adjusted = mixRgb(adjusted, [17, 19, 24], 0.14);
      step += 1;
    }
  }

  const fg: [number, number, number] =
    contrastRatio([255, 255, 255], adjusted) >= contrastRatio([15, 17, 21], adjusted)
      ? [255, 255, 255]
      : [15, 17, 21];
  const soft = resolved === "dark"
    ? mixRgb(darkSurface, adjusted, 0.18)
    : mixRgb(lightSurface, adjusted, 0.12);
  const strong = resolved === "dark"
    ? mixRgb(adjusted, [255, 255, 255], 0.12)
    : mixRgb(adjusted, [15, 17, 21], 0.12);

  root.dataset.accent = "custom";
  root.style.setProperty("--accent", rgbToHex(...adjusted));
  root.style.setProperty("--accent-strong", rgbToHex(...strong));
  root.style.setProperty("--accent-soft", rgbToHex(...soft));
  root.style.setProperty("--accent-wash", `rgba(${Math.round(adjusted[0])}, ${Math.round(adjusted[1])}, ${Math.round(adjusted[2])}, ${resolved === "dark" ? 0.16 : 0.12})`);
  root.style.setProperty("--accent-fg", rgbToHex(...fg));
  return resolved;
}

export function watchSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!media) return () => {};
  const handler = () => onChange();
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}
