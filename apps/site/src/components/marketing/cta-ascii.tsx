import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { GLYPHS, VERTEX_SHADER, compile, createGlyphAtlas, readInk } from "./ascii-gl";

/** Grid cell size in CSS pixels */
const CELL_PX = 10;
const MAX_DPR = 1.5;

// Rising plumes of ASCII light, using the same glyph atlas and ink as the hero.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uCell;
uniform sampler2D uGlyphs;
uniform float uGlyphCount;
uniform vec3 uInk;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}

float fire(vec2 uv, float t) {
  float height = 1.0 - uv.y;
  // Preserve the plume proportions on phones and wide screens alike.
  vec2 p = vec2(uv.x * uResolution.x / uResolution.y * 5.0, height * 3.0);
  // Noise travels upwards; finer layers break the plumes into flickering wisps.
  vec2 flow = vec2(p.x, p.y - t * 0.65);
  float n = noise(flow) * 0.57;
  n += noise(flow * 2.0 + vec2(3.1, -t * 0.3)) * 0.28;
  n += noise(flow * 4.0 + vec2(7.3, -t * 0.5)) * 0.15;
  float sway = sin(p.x * 2.3 + t * 0.45) * 0.035;
  float heat = clamp((n - height * 1.15 + 0.12 + sway) * 1.9, 0.0, 1.0);
  // Keep the headline and actions legible while taller flames frame both sides.
  float sides = smoothstep(0.12, 0.38, abs(uv.x - 0.5));
  float clearCopy = mix(smoothstep(0.72, 0.98, uv.y), 1.0, sides);
  return heat * clearCopy * smoothstep(0.0, 0.22, uv.y);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 local = fract(frag / uCell);
  vec2 uv = center / uResolution;

  // Gently stir the plumes around the pointer
  vec2 toPointer = (center - uPointer) / uResolution.y;
  float near = 1.0 - smoothstep(0.0, 0.35, length(toPointer));
  uv += normalize(toPointer + 1e-5) * near * uPointerStrength * 0.04;

  float gray = clamp(fire(uv, uTime), 0.0, 1.0);

  float index = clamp(floor(gray * (uGlyphCount - 1.0)), 0.0, uGlyphCount - 1.0);
  vec2 glyphUv = vec2((index + local.x) / uGlyphCount, local.y);
  // Fainter light gets lighter ink as well as a sparser glyph, so beams fade out at their edges
  float alpha = texture2D(uGlyphs, glyphUv).a * mix(0.45, 1.0, gray);

  // Ink in the page's text color, premultiplied
  gl_FragColor = vec4(uInk * alpha, alpha);
}
`;

/** Decorative ASCII fire for the closing CTA. Pauses offscreen and respects reduced motion. */
export function CtaAscii() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, antialias: false });
    if (!canvas || !gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    const cleanup = () => {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (program) gl.deleteProgram(program);
    };
    if (!vertex || !fragment || !program) {
      cleanup();
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      cleanup();
      return;
    }
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
    if (!atlas || !texture || !buffer) {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      cleanup();
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "uGlyphs"), 0);
    gl.uniform1f(gl.getUniformLocation(program, "uGlyphCount"), GLYPHS.length);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      pointerStrength: gl.getUniformLocation(program, "uPointerStrength"),
      cell: gl.getUniformLocation(program, "uCell"),
      ink: gl.getUniformLocation(program, "uInk"),
    };

    let dpr = 1;
    // The canvas sits under the CTA content, so track the pointer on the window
    const pointer = { x: -9999, y: -9999, strength: 0, target: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) * dpr;
      pointer.y = (event.clientY - rect.top) * dpr;
      pointer.target =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom &&
        event.pointerType === "mouse"
          ? 1
          : 0;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const draw = (seconds: number) => {
      pointer.strength += (pointer.target - pointer.strength) * 0.08;
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, seconds);
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.pointerStrength, pointer.strength);
      gl.uniform1f(uniforms.cell, CELL_PX * dpr);
      const [r, g, b] = readInk(canvas);
      gl.uniform3f(uniforms.ink, r, g, b);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let elapsed = 4;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw(reduceMotion ? 4 : elapsed);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const themeObserver = new MutationObserver(() => draw(reduceMotion ? 4 : elapsed));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      elapsed = (now - start) / 1000;
      draw(elapsed);
      frame = requestAnimationFrame(loop);
    };

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry?.isIntersecting ?? true) frame = requestAnimationFrame(loop);
    });

    if (reduceMotion) draw(4);
    else intersectionObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      cleanup();
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      tabIndex={-1}
      className="pointer-events-none absolute inset-0 size-full opacity-40"
      style={{
        // Fades in at the top only, so the flames run right down to the section's bottom edge
        maskImage: "linear-gradient(to bottom, transparent, black 25%)",
      }}
    />
  );
}
