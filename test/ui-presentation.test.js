import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(new URL("../ui/src/styles.css", import.meta.url), "utf8");

function variablesFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `Missing palette: ${selector}`);
  return Object.fromEntries(
    [...rule[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const [red, green, blue] = hex.slice(1).match(/.{2}/g).map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("interface captions are at least 12px and body text is at least 14px", () => {
  const fonts = variablesFor(":root");
  assert.ok(Number.parseFloat(fonts["--font-caption"]) >= 12);
  assert.ok(Number.parseFloat(fonts["--font-small"]) >= 13);
  assert.ok(Number.parseFloat(fonts["--font-body"]) >= 14);
});

test("light-theme text meets normal-text contrast on every content surface", () => {
  const palette = variablesFor('#app[data-theme="light"]');
  const surfaces = ["--bg", "--surface", "--surface-raised", "--surface-muted"];
  const textColors = ["--text", "--text-bright", "--muted", "--muted-2", "--positive", "--warning", "--negative", "--info", "--pink"];
  for (const surface of surfaces) {
    for (const text of textColors) {
      const ratio = contrast(palette[text], palette[surface]);
      assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  }
});

test("all light-theme accent choices keep selected items and buttons readable", () => {
  const light = variablesFor('#app[data-theme="light"]');
  for (const accent of ["mint", "blue", "gold", "rose"]) {
    const palette = accent === "mint"
      ? light
      : { ...light, ...variablesFor(`#app[data-theme="light"][data-accent="${accent}"]`) };
    assert.ok(contrast(palette["--accent"], palette["--accent-soft"]) >= 4.5, `${accent} selected text`);
    assert.ok(contrast("#ffffff", palette["--accent"]) >= 4.5, `${accent} button text`);
  }
});
