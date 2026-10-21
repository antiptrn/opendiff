import { cn } from "components";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { compile, createGlyphAtlas, GLYPHS, readInk, VERTEX_SHADER } from "./ascii-gl";

/** Grid cell size in CSS pixels */
const CELL_PX = 8;
const MAX_DPR = 1.5;

/** Abstract shapes the shader can draw, by the index it switches on */
export const FEATURE_SHAPES = {
  arc: 0,
  stripes: 1,
  rings: 2,
  blob: 3,
  quarter: 4,
} as const;

export type FeatureShape = keyof typeof FEATURE_SHAPES;

// Draws one abstract shape in ASCII, inked in the card's text color: each cell samples the shape's distance field once and
// draws the glyph for that brightness. Columns get their own brightness and a shimmer that runs
// down them, so the shape reads as streaks of light fading out towards the bottom.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCell;
uniform float uShape;
uniform vec3 uInk;
uniform sampler2D uGlyphs;
uniform float uGlyphCount;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Smooth union, so shapes melt into each other
float smoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Signed distance to the shape, in card widths, with y pointing down. The shapes are large and
// run off the card's edges on purpose.
float shape(vec2 p) {
  if (uShape < 0.5) {
    // A thick arc sweeping around the bottom left
    return abs(length(p - vec2(-0.2, 0.32)) - 0.48) - 0.11;
  }
  if (uShape < 1.5) {
    // Three bold parallel stripes rising to the right, slowly sliding along their length
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.70710678;
    float band = abs(fract(q.y * 3.2 + 0.5) - 0.5) / 3.2 - 0.065;
    float length_ = abs(q.x + 0.06 * sin(uTime * 0.3)) - 0.42;
    return max(band, max(length_, abs(q.y) - 0.42));
  }
  if (uShape < 2.5) {
    // Two thick rings overlapping, drifting slowly towards and away from each other
    float drift = 0.03 * sin(uTime * 0.3);
    float a = abs(length(p - vec2(-0.13 - drift, 0.02)) - 0.27) - 0.07;
    float b = abs(length(p - vec2(0.17 + drift, -0.12)) - 0.27) - 0.07;
    return min(a, b);
  }
  if (uShape < 3.5) {
    // Three circles melting into one slowly shifting blob
    float t = uTime * 0.4;
    float a = length(p - vec2(-0.1 + 0.03 * sin(t), -0.04)) - 0.2;
    float b = length(p - vec2(0.15, 0.13 + 0.03 * cos(t * 1.3))) - 0.22;
    float c = length(p - vec2(0.12 + 0.03 * cos(t * 0.8), -0.22)) - 0.13;
    return smoothMin(smoothMin(a, b, 0.14), c, 0.14);
  }
  // A large quarter disc growing out of the top-right corner
  return length(p - vec2(0.34, -0.3)) - 0.5;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 local = fract(frag / uCell);

  // Large and centered in the upper part of the card
  vec2 uv = center / uResolution;
  vec2 p = (center - uResolution * vec2(0.5, 0.36)) / uResolution.x * 0.62;
  float d = shape(p);
  float fill = smoothstep(0.015, -0.01, d);
  float glow = exp(-max(d, 0.0) * 14.0) * 0.3;

  float column = cell.x;
  float streak = 0.7 + 0.3 * hash(column);
  float shimmer = 0.7 + 0.3 * sin(cell.y * 0.35 - uTime * 1.6 + hash(column + 3.0) * 6.2831853);
  // Fade out towards the bottom, where the copy sits
  float fade = 1.0 - smoothstep(0.3, 0.85, uv.y);
  float gray = clamp((fill + glow) * streak * shimmer * fade, 0.0, 1.0);

  float index = clamp(floor(gray * (uGlyphCount - 1.0)), 0.0, uGlyphCount - 1.0);
  vec2 glyphUv = vec2((index + local.x) / uGlyphCount, local.y);
  float alpha = texture2D(uGlyphs, glyphUv).a * mix(0.35, 1.0, gray) * 0.85;

  // Ink in the card's text color, premultiplied
  gl_FragColor = vec4(uInk * alpha, alpha);
}
`;

/**
 * Animated ASCII rendering of one feature's shape, filling its card. Pauses offscreen and
 * draws a single still frame for reduced motion. Renders nothing if WebGL is unavailable.
 */
export function FeatureAscii({ shape, className }: { shape: FeatureShape; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, antialias: false });
    if (!canvas || !gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const atlas = createGlyphAtlas();
    const texture = gl.createTexture();
    if (!atlas || !texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "uGlyphs"), 0);
    gl.uniform1f(gl.getUniformLocation(program, "uGlyphCount"), GLYPHS.length);
    gl.uniform1f(gl.getUniformLocation(program, "uShape"), FEATURE_SHAPES[shape]);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      cell: gl.getUniformLocation(program, "uCell"),
      ink: gl.getUniformLocation(program, "uInk"),
    };

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = (seconds: number) => {
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, seconds);
      gl.uniform1f(uniforms.cell, CELL_PX * dpr);
      const [r, g, b] = readInk(canvas);
      gl.uniform3f(uniforms.ink, r, g, b);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw((now - start) / 1000);
      frame = requestAnimationFrame(loop);
    };

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry?.isIntersecting ?? true) frame = requestAnimationFrame(loop);
    });

    if (reduceMotion) draw(2);
    else intersectionObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [reduceMotion, shape]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
