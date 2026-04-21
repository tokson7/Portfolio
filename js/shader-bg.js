(function() {
  var canvas = document.getElementById('shader-bg');
  if (!canvas) return;
  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  var vertexSource = 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }';

  var fragmentSource = [
    'precision highp float;',
    'uniform vec2 iResolution;',
    'uniform float iTime;',
    '',
    'float N21(vec2 p) {',
    '  vec3 a = fract(vec3(p.xyx) * vec3(213.897, 653.453, 253.098));',
    '  a += dot(a, a.yzx + 79.76);',
    '  return fract((a.x + a.y) * a.z);',
    '}',
    '',
    'vec2 GetPos(vec2 id, vec2 offs, float t) {',
    '  float n = N21(id + offs);',
    '  float n1 = fract(n * 10.0);',
    '  float n2 = fract(n * 100.0);',
    '  float a = t + n;',
    '  return offs + vec2(sin(a * n1), cos(a * n2)) * 0.4;',
    '}',
    '',
    'float df_line(vec2 a, vec2 b, vec2 p) {',
    '  vec2 pa = p - a, ba = b - a;',
    '  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',
    '',
    'float line(vec2 a, vec2 b, vec2 uv) {',
    '  float d = df_line(a, b, uv);',
    '  float d2 = length(a - b);',
    '  float fade = smoothstep(1.5, 0.5, d2);',
    '  fade += smoothstep(0.05, 0.02, abs(d2 - 0.75));',
    '  return smoothstep(0.04, 0.01, d) * fade;',
    '}',
    '',
    'float sparkle(vec2 st, vec2 p, float t) {',
    '  float d = length(st - p);',
    '  float s = 0.005 / (d * d);',
    '  s *= smoothstep(1.0, 0.7, d);',
    '  float pulse = sin((fract(p.x) + fract(p.y) + t) * 5.0) * 0.4 + 0.6;',
    '  pulse = pow(pulse, 20.0);',
    '  return s * pulse;',
    '}',
    '',
    'float NetLayer(vec2 st, float n, float t) {',
    '  vec2 id = floor(st) + n;',
    '  st = fract(st) - 0.5;',
    '',
    '  vec2 p0 = GetPos(id, vec2(-1.0,-1.0), t);',
    '  vec2 p1 = GetPos(id, vec2( 0.0,-1.0), t);',
    '  vec2 p2 = GetPos(id, vec2( 1.0,-1.0), t);',
    '  vec2 p3 = GetPos(id, vec2(-1.0, 0.0), t);',
    '  vec2 p4 = GetPos(id, vec2( 0.0, 0.0), t);',
    '  vec2 p5 = GetPos(id, vec2( 1.0, 0.0), t);',
    '  vec2 p6 = GetPos(id, vec2(-1.0, 1.0), t);',
    '  vec2 p7 = GetPos(id, vec2( 0.0, 1.0), t);',
    '  vec2 p8 = GetPos(id, vec2( 1.0, 1.0), t);',
    '',
    '  float m = 0.0;',
    '  m += line(p4, p0, st);',
    '  m += line(p4, p1, st);',
    '  m += line(p4, p2, st);',
    '  m += line(p4, p3, st);',
    '  m += line(p4, p5, st);',
    '  m += line(p4, p6, st);',
    '  m += line(p4, p7, st);',
    '  m += line(p4, p8, st);',
    '',
    '  m += line(p1, p3, st);',
    '  m += line(p1, p5, st);',
    '  m += line(p7, p5, st);',
    '  m += line(p7, p3, st);',
    '',
    '  float sp = 0.0;',
    '  sp += sparkle(st, p0, t);',
    '  sp += sparkle(st, p1, t);',
    '  sp += sparkle(st, p2, t);',
    '  sp += sparkle(st, p3, t);',
    '  sp += sparkle(st, p4, t);',
    '  sp += sparkle(st, p5, t);',
    '  sp += sparkle(st, p6, t);',
    '  sp += sparkle(st, p7, t);',
    '  sp += sparkle(st, p8, t);',
    '',
    '  float sPhase = (sin(t + n) + sin(t * 0.1)) * 0.25 + 0.5;',
    '  sPhase += pow(sin(t * 0.1) * 0.5 + 0.5, 50.0) * 5.0;',
    '  m += sp * sPhase;',
    '',
    '  return m;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy - iResolution.xy * 0.5) / iResolution.y;',
    '  float t = iTime * 0.1;',
    '  float s = sin(t);',
    '  float c = cos(t);',
    '  mat2 rot = mat2(c, -s, s, c);',
    '  vec2 st = uv * rot;',
    '',
    '  float m = 0.0;',
    '  for (float i = 0.0; i < 1.0; i += 0.25) {',
    '    float z = fract(t + i);',
    '    float size = mix(15.0, 1.0, z);',
    '    float fade = smoothstep(0.0, 0.6, z) * smoothstep(1.0, 0.8, z);',
    '    m += fade * NetLayer(st * size, i, iTime);',
    '  }',
    '',
    '  vec3 baseCol = vec3(s, cos(t * 0.4), -sin(t * 0.24)) * 0.4 + 0.6;',
    '  vec3 col = baseCol * m;',
    '  col *= 1.0 - dot(uv, uv);',
    '  float t2 = mod(iTime, 230.0);',
    '  col *= smoothstep(0.0, 20.0, t2) * smoothstep(224.0, 200.0, t2);',
    '  col *= 0.5;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compileShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  var vs = compileShader(gl.VERTEX_SHADER, vertexSource);
  var fs = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) { console.error('Shader compilation failed'); return; }

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  var posLoc = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  var resLoc  = gl.getUniformLocation(program, 'iResolution');
  var timeLoc = gl.getUniformLocation(program, 'iTime');

  function resize() {
    var dpr = window.innerWidth < 768 ? 1.0 : Math.min(window.devicePixelRatio || 1.0, 1.5);
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  var startTime = performance.now();
  var isRunning = true;
  var rafId     = null;

  function render() {
    if (!isRunning) return;
    var t = (performance.now() - startTime) / 1000.0;
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafId = requestAnimationFrame(render);
  }
  render();

  window.stopShaderAnimation = function() {
    isRunning = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    canvas.style.display = 'none';
  };
  window.startShaderAnimation = function() {
    canvas.style.display = 'block';
    isRunning = true;
    startTime = performance.now();
    render();
  };
})();
