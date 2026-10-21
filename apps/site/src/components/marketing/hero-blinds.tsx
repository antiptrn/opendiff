import { useEffect, useRef } from "react";

const MAX_DPR = 1.5;

const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Light coming in at both edges through vertical blinds, after Featurebase's hero backdrop. The
// glow hugs the left and right edges, starts faint at the top and widens towards the bottom, while
// the middle stays clear. Slats are a fixed 64px wide: each catches a thin bright edge and then
// dims across its face, so the blinds only show where light falls on them.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform float uDpr;

const float SLAT_WIDTH = 64.0;
const float PEAK_ALPHA = 0.42;
// Indigo light
const vec3 COLOR = vec3(0.42, 0.40, 0.62);

// Brightness of the light at a point, x across the width and y down from the top in widths
float light(float x, float y) {
  float side = min(x, 1.0 - x);
  float strength = pow(clamp(y / 0.7, 0.0, 1.0), 1.5);
  float spread = mix(0.05, 0.14, clamp(y / 0.7, 0.0, 1.0));
  // Fade out before the bottom of the canvas so it never ends on a hard edge
  float fade = 1.0 - smoothstep(0.75, 1.05, y);
  return strength * exp(-side / spread) * fade;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  float x = frag.x / uResolution.x;
  float y = frag.y / (uResolution.x * 0.5);

  float slatPx = SLAT_WIDTH * uDpr;
  float across = fract(frag.x / slatPx);
  // Bright edge where each slat catches the light, then a slow dim across its face
  float edge = exp(-across * slatPx / (4.0 * uDpr));
  float slat = 1.0 + 0.12 * edge - 0.1 * across;

  float alpha = clamp(light(x, y) * slat * PEAK_ALPHA, 0.0, 1.0);
  // Premultiplied
  gl_FragColor = vec4(COLOR * alpha, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
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

/**
 * Light through vertical blinds behind the hero, after Featurebase's hero backdrop. It is a still
 * image, so it only redraws when the canvas resizes. Renders nothing if WebGL is unavailable.
 */
export function HeroBlinds() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const resolution = gl.getUniformLocation(program, "uResolution");
    const dprLocation = gl.getUniformLocation(program, "uDpr");

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(dprLocation, dpr);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-x-0 top-0 h-[1350px] w-full"
    />
  );
}
