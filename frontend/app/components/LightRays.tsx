'use client'
import { useRef, useEffect } from 'react'

// LightRays background — vanilla WebGL port of react-bits LightRays (no ogl dependency).
// Params baked to the design spec: top-center origin, #a8b9ca, speed 1, spread 0.7, length 3, followMouse.
export function LightRays() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
    if (!gl) return

    const VERT = `attribute vec2 position; varying vec2 vUv;
      void main(){ vUv = position*0.5+0.5; gl_Position = vec4(position,0.,1.); }`

    const FRAG = `precision highp float;
      uniform float iTime; uniform vec2 iResolution;
      uniform vec2 rayPos; uniform vec2 rayDir; uniform vec3 raysColor;
      uniform float raysSpeed; uniform float lightSpread; uniform float rayLength;
      uniform float fadeDistance; uniform float saturation;
      uniform vec2 mousePos; uniform float mouseInfluence;
      varying vec2 vUv;
      float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed){
        vec2 sourceToCoord = coord - raySource;
        vec2 dirNorm = normalize(sourceToCoord);
        float cosAngle = dot(dirNorm, rayRefDirection);
        float spreadFactor = pow(max(cosAngle, 0.0), 1.0 / max(lightSpread, 0.001));
        float distance = length(sourceToCoord);
        float maxDistance = iResolution.x * rayLength;
        float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
        float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
        float baseStrength = clamp(
          (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
          (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)), 0.0, 1.0);
        return baseStrength * lengthFalloff * fadeFalloff * spreadFactor;
      }
      void main(){
        vec2 fragCoord = vUv * iResolution;
        vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
        vec2 finalRayDir = rayDir;
        if (mouseInfluence > 0.0){
          vec2 mouseScreenPos = mousePos * iResolution.xy;
          vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
          finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
        }
        vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
        vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
        vec4 fragColor = rays1 * 0.5 + rays2 * 0.4;
        float brightness = 1.0 - (coord.y / iResolution.y);
        fragColor.x *= 0.1 + brightness * 0.8;
        fragColor.y *= 0.3 + brightness * 0.6;
        fragColor.z *= 0.5 + brightness * 0.5;
        if (saturation != 1.0){
          float gray = dot(fragColor.rgb, vec3(0.299,0.587,0.114));
          fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
        }
        fragColor.rgb *= raysColor;
        gl_FragColor = fragColor;
      }`

    const sh = (t: number, src: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, src); gl.compileShader(o); return o }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog); gl.useProgram(prog)
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'position')
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const U = (n: string) => gl.getUniformLocation(prog, n)
    const hex = [0xa8 / 255, 0xb9 / 255, 0xca / 255] // #a8b9ca
    gl.uniform3f(U('raysColor'), hex[0], hex[1], hex[2])
    gl.uniform1f(U('raysSpeed'), 1)
    gl.uniform1f(U('lightSpread'), 0.7)
    gl.uniform1f(U('rayLength'), 3)
    gl.uniform1f(U('fadeDistance'), 1)
    gl.uniform1f(U('saturation'), 1)
    gl.uniform1f(U('mouseInfluence'), 0.1)
    const uTime = U('iTime'), uRes = U('iResolution'), uRayPos = U('rayPos'), uRayDir = U('rayDir'), uMouse = U('mousePos')

    let mx = 0.5, my = 0.5
    const onMove = (e: MouseEvent) => { mx = e.clientX / window.innerWidth; my = e.clientY / window.innerHeight }
    window.addEventListener('mousemove', onMove)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr
      canvas.width = w; canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
      // top-center origin: anchor above the top, dir pointing down
      gl.uniform2f(uRayPos, 0.5 * w, -0.2 * h)
      gl.uniform2f(uRayDir, 0, 1)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      gl.uniform1f(uTime, t * 0.001)
      gl.uniform2f(uMouse, mx, my)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', resize)
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    />
  )
}
