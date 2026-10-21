/** Shared pieces of the ASCII WebGL shaders: the glyph atlas, a full-screen vertex shader, compiling, and reading the ink color */

/** Glyphs from emptiest to densest; each cell shows the one matching its brightness */
export const GLYPHS = " .:-+*=%@#";
/** Atlas tile size in pixels per glyph */
const GLYPH_PX = 64;

export const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** Draws the glyphs side by side on a canvas, white on transparent, to upload as a texture */
export function createGlyphAtlas() {
  const atlas = document.createElement("canvas");
  atlas.width = GLYPH_PX * GLYPHS.length;
  atlas.height = GLYPH_PX;
  const context = atlas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#fff";
  context.font = `bold ${GLYPH_PX}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  Array.from(GLYPHS).forEach((glyph, i) => {
    context.fillText(glyph, (i + 0.5) * GLYPH_PX, GLYPH_PX / 2);
  });
  return atlas;
}

export function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const inkProbe =
  typeof document === "undefined"
    ? null
    : document.createElement("canvas").getContext("2d", { willReadFrequently: true });

/** The element's text color as 0-1 RGB, so the ink follows the theme and hover states */
export function readInk(element: HTMLElement): [number, number, number] {
  if (!inkProbe) return [1, 1, 1];
  // Normalize whatever color syntax the theme uses (oklch etc.) to sRGB by painting it
  inkProbe.fillStyle = "#fff";
  inkProbe.fillStyle = window.getComputedStyle(element).color;
  inkProbe.fillRect(0, 0, 1, 1);
  const [r, g, b] = inkProbe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}
