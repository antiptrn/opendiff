import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { compile, createGlyphAtlas, GLYPHS, readInk, VERTEX_SHADER } from "./ascii-gl";

/** Grid cell size in CSS pixels */
const CELL_PX = 10;
const MAX_DPR = 1.5;

// Renders a procedural light source (beams fanning out from above the hero down both sides, with
// pulses streaming along them) as ASCII: each grid cell samples the source once and draws the
// glyph for that brightness. The pointer bends the beams away from it.
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

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// One fan of rays: \`count\` beams around the origin, each with its own width, brightness and
// pulses that stream outwards along it
float rays(float angle, float radius, float count, float t, float seed) {
  float coord = angle * count;
  float id = floor(coord) + seed;
  // Cosine profile: brightest down the middle of the beam, fading to nothing at both edges, so
  // neighbouring beams never meet at a hard line
  float profile = pow(0.5 - 0.5 * cos(fract(coord) * 6.2831853), 1.5 + 2.0 * hash(id));

  // Soft pulses travelling outwards, with no hard head or tail
  float speed = 0.18 + 0.22 * hash(id + 3.0);
  float phase = radius * (1.6 + hash(id + 5.0)) - t * speed + hash(id + 7.0);
  float pulse = pow(0.5 + 0.5 * sin(phase * 6.2831853), 2.0);

  return profile * (0.3 + 0.7 * hash(id + 11.0)) * (0.25 + 0.75 * pulse);
}

float beams(vec2 uv, float t) {
  // Rays fan out from a point far above the hero, so over the hero they run steeply: down-left
  // on the left side and down-right on the right
  float aspect = uResolution.x / uResolution.y;
  vec2 q = (uv - vec2(0.5, -0.37)) * vec2(aspect, 1.0);
  float radius = length(q);
  // Bend each ray outwards the further it travels, so the beams curve away from the copy
  float angle = atan(q.x, q.y) - sign(q.x) * 0.35 * pow(max(radius - 0.45, 0.0), 2.0);

  float wobble = sin(radius * 3.0 - t * 0.2) * 0.008;
  float light = max(
    rays(angle + wobble, radius, 18.0, t, 0.0),
    rays(angle - wobble * 0.5, radius, 8.0, t * 0.8, 50.0) * 0.9
  );

  // Keep the middle clear for the copy, and start the beams below the top of the hero
  float sides = smoothstep(0.1, 0.32, abs(uv.x - 0.5));
  float top = smoothstep(0.15, 0.35, uv.y);
  return light * 1.35 * sides * top;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 local = fract(frag / uCell);
  vec2 uv = center / uResolution;

  // Push the source away from the pointer
  vec2 toPointer = (center - uPointer) / uResolution.y;
  float near = smoothstep(0.35, 0.0, length(toPointer));
  uv += normalize(toPointer + 1e-5) * near * uPointerStrength * 0.04;

  float gray = clamp(beams(uv, uTime), 0.0, 1.0);

  float index = clamp(floor(gray * (uGlyphCount - 1.0)), 0.0, uGlyphCount - 1.0);
  vec2 glyphUv = vec2((index + local.x) / uGlyphCount, local.y);
  // Fainter light gets lighter ink as well as a sparser glyph, so beams fade out at their edges
  float alpha = texture2D(uGlyphs, glyphUv).a * mix(0.45, 1.0, gray);

  // Ink in the page's text color, premultiplied
  gl_FragColor = vec4(uInk * alpha, alpha);
}
`;

/**
 * Animated ASCII light beams behind the hero, after the Sentinel template's hero but drawn from a
 * procedural source in the page's text color. Pauses offscreen and draws a single still frame
 * for reduced motion. Renders nothing if WebGL is unavailable.
 */
export function HeroShader() {
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

    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      pointerStrength: gl.getUniformLocation(program, "uPointerStrength"),
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

    // The canvas sits under the hero copy, so track the pointer on the window
    const pointer = { x: -9999, y: -9999, strength: 0, target: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) * dpr;
      pointer.y = (event.clientY - rect.top) * dpr;
      pointer.target =
        event.clientY >= rect.top && event.clientY <= rect.bottom && event.pointerType === "mouse"
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

    if (reduceMotion) draw(4);
    else intersectionObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-x-0 top-0 h-[900px] w-full opacity-40"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 25%, black 80%, transparent 100%)",
      }}
    />
  );
}
