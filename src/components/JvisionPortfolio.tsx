// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import jvisionLogo from '@/assets/jvision-logo.png';
import { PROJECTS as REAL_PROJECTS } from '@/data/projects';

const CTA_COLOR = '#2D42FF';
const ABOUT_VIDEO_URL = 'https://www.youtube.com/embed/XfJ7kWYxX4E?autoplay=1&mute=1&loop=1&playlist=XfJ7kWYxX4E&controls=0&showinfo=0&modestbranding=1&rel=0&playsinline=1&start=0&enablejsapi=1';

/**
 * JVISION PORTFOLIO
 * Infinite-scrolling, 3D-cascading portfolio with WebGL fluid ripple shaders.
 */

// --- INTERNAL WEBGL ENGINE FOR PORTFOLIO CARDS ---
const WebGLCanvasEngine = ({ src, onClick, onRippleStateChange, pulseKey }) => {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const ripplesRef = useRef([]);
  const isRunningRef = useRef(false);
  const isRipplingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const interactionRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) return;

    glRef.current = gl;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform sampler2D u_image;
      uniform vec4 u_ripples[20];
      uniform int u_rippleCount;
      uniform float u_aspect;
      varying vec2 v_texCoord;

      void main() {
        vec2 uv = v_texCoord;
        vec2 offset = vec2(0.0);
        float clickBrightness = 0.0;

        for(int i = 0; i < 20; i++) {
          if (i >= u_rippleCount) break;
          vec2 center = u_ripples[i].xy;
          float time = u_ripples[i].z;
          float intensity = u_ripples[i].w;
          vec2 p = uv - center;
          p.x *= u_aspect;
          float dist = length(p);
          float isClick = step(2.0, intensity);
          float speed = mix(0.8, 1.1, isClick);
          float radius = time * speed;
          float width = mix(0.04 + time * 0.03, 0.3 + time * 0.15, isClick);
          float waveFreq = mix(45.0, 10.0, isClick);
          float mask = smoothstep(width, 0.0, abs(dist - radius));
          float wave = sin((dist - radius) * waveFreq);
          float decay = mix(max(0.0, 1.0 - time / 2.0), max(0.0, 1.0 - time / 1.5), isClick);
          float strength = mix(0.12, 0.34, isClick);
          if (dist > 0.0) {
             offset += normalize(p) * wave * mask * decay * intensity * strength;
             clickBrightness += mask * max(0.0, wave) * isClick * decay * 0.55;
          }
        }
        vec2 finalUV = clamp(uv + offset, 0.0, 1.0);
        vec4 color = texture2D(u_image, finalUV);
        color.rgb += clickBrightness;
        gl_FragColor = color;
      }
    `;

    const createShader = (gl, type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1
    ]), gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;

    let animationFrameId;
    let lastTime = performance.now();

    const uRipplesLoc = gl.getUniformLocation(program, 'u_ripples');
    const uCountLoc = gl.getUniformLocation(program, 'u_rippleCount');
    const uAspectLoc = gl.getUniformLocation(program, 'u_aspect');
    gl.uniform1f(uAspectLoc, canvas.width / canvas.height);

    const drawScene = () => {
      const currentTime = performance.now();
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const activeRipples = [];
      for (const r of ripplesRef.current) {
        r.time += dt;
        if (r.time < 2.0) activeRipples.push(r);
      }
      ripplesRef.current = activeRipples;

      const hasRipples = activeRipples.length > 0;
      if (hasRipples !== isRipplingRef.current) {
        isRipplingRef.current = hasRipples;
        if (onRippleStateChange) onRippleStateChange(hasRipples);
      }

      const ripplesData = new Float32Array(80);
      activeRipples.forEach((r, i) => {
        ripplesData[i * 4 + 0] = r.x;
        ripplesData[i * 4 + 1] = r.y;
        ripplesData[i * 4 + 2] = r.time;
        ripplesData[i * 4 + 3] = r.intensity;
      });

      gl.uniform4fv(uRipplesLoc, ripplesData);
      gl.uniform1i(uCountLoc, activeRipples.length);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (hasRipples) {
        animationFrameId = requestAnimationFrame(drawScene);
      } else {
        isRunningRef.current = false;
      }
    };

    image.onload = () => {
      const textureCanvas = document.createElement('canvas');
      textureCanvas.width = canvas.width;
      textureCanvas.height = canvas.height;
      const ctx = textureCanvas.getContext('2d');
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const drawX = (canvas.width - drawWidth) / 2;
      const drawY = (canvas.height - drawHeight) / 2;
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      drawScene();
    };

    const startLoop = () => {
      if (!isRunningRef.current) {
        isRunningRef.current = true;
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(drawScene);
      }
    };

    interactionRef.current = (x, y, isClick = false, intensityOverride) => {
      const rect = canvas.getBoundingClientRect();
      const uvX = x / rect.width;
      const uvY = 1.0 - (y / rect.height);
      if (isClick) {
        ripplesRef.current.push({ x: uvX, y: uvY, time: 0, intensity: intensityOverride ?? 3.0 });
        if (ripplesRef.current.length > 20) ripplesRef.current.shift();
        startLoop();
      } else {
        const dx = uvX - lastMouseRef.current.x;
        const dy = uvY - lastMouseRef.current.y;
        const velocity = Math.sqrt(dx * dx + dy * dy);
        lastMouseRef.current = { x: uvX, y: uvY };
        if (velocity > 0.005) {
          const intensity = Math.min(1.5, 0.4 + velocity * 20);
          ripplesRef.current.push({ x: uvX, y: uvY, time: 0, intensity });
          if (ripplesRef.current.length > 20) ripplesRef.current.shift();
          startLoop();
        }
      }
    };

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (glRef.current) {
        glRef.current.deleteProgram(program);
        const ext = glRef.current.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  }, [src, onRippleStateChange]);

  useEffect(() => {
    if (!pulseKey || !canvasRef.current || !interactionRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = typeof pulseKey === 'object' && pulseKey.x != null ? pulseKey.x - rect.left : rect.width * 0.5;
    const y = typeof pulseKey === 'object' && pulseKey.y != null ? pulseKey.y - rect.top : rect.height * 0.5;
    const intensity = typeof pulseKey === 'object' && pulseKey.intensity != null ? pulseKey.intensity : undefined;
    interactionRef.current(x, y, true, intensity);
  }, [pulseKey]);

  const handleMouseMove = (e) => {
    if (!canvasRef.current || !interactionRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    interactionRef.current(e.clientX - rect.left, e.clientY - rect.top, false);
  };
  const handleTouchMove = (e) => {
    if (!canvasRef.current || !interactionRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    interactionRef.current(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top, false);
  };
  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (!canvasRef.current || !interactionRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    interactionRef.current(e.clientX - rect.left, e.clientY - rect.top, true);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onClick={handleClick}
      className="w-full h-full block"
    />
  );
};

// --- SMART WRAPPER ---
const WebGLRippleImage = ({ src, alt, onClick, isHovered, isClicked }) => {
  const [isRippling, setIsRippling] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const forceAwake = isClicked || isRippling;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      onPointerEnter={() => setPulseKey((key) => key + 1)}
    >
      <img
        src={src}
        alt={alt}
        onClick={onClick}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-150 group-hover:opacity-0"
        style={{ opacity: forceAwake ? 0 : undefined }}
        draggable={false}
      />
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ opacity: forceAwake ? 1 : undefined }}
      >
        <WebGLCanvasEngine
          src={src}
          onClick={onClick}
          onRippleStateChange={setIsRippling}
          pulseKey={pulseKey}
        />
      </div>
    </div>
  );
};

// --- CONTACT PAGE WEBGL BACKGROUND ---
const ContactWebGLBackground = ({ mousePos, clickTrigger }) => {
  const canvasRef = useRef(null);
  const mouseRef = useRef(mousePos);
  const ripplesRef = useRef([]);
  const currentParallax = useRef({ x: 0, y: 0 });

  useEffect(() => { mouseRef.current = mousePos; }, [mousePos]);

  useEffect(() => {
    if (clickTrigger) {
      ripplesRef.current.push({
        x: clickTrigger.x / window.innerWidth,
        y: 1.0 - (clickTrigger.y / window.innerHeight),
        time: 0,
        intensity: clickTrigger.intensity ?? 6.0
      });
    }
  }, [clickTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const gl = canvas.getContext('webgl', { alpha: false });
    if (!gl) return;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
    const fsSource = `
      precision mediump float;
      uniform sampler2D u_image;
      uniform vec4 u_ripples[5];
      uniform int u_rippleCount;
      uniform float u_aspect;
      uniform vec2 u_parallax;
      varying vec2 v_texCoord;
      void main() {
        vec2 mappedUV = v_texCoord * 0.9 + 0.05;
        vec2 baseUV = mappedUV + u_parallax;
        vec2 offset = vec2(0.0);
        float brightness = 0.0;
        for(int i = 0; i < 5; i++) {
          if (i >= u_rippleCount) break;
          vec2 center = u_ripples[i].xy;
          float time = u_ripples[i].z;
          float intensity = u_ripples[i].w;
          vec2 p = v_texCoord - center;
          p.x *= u_aspect;
          float dist = length(p);
          float speed = 0.75;
          float radius = time * speed;
          float width = 0.18 + time * 0.12;
          float waveFreq = 18.0;
          float mask = smoothstep(width, 0.0, abs(dist - radius));
          float wave = sin((dist - radius) * waveFreq);
          float decay = max(0.0, 1.0 - time / 2.5);
          if (dist > 0.0) {
             offset += normalize(p) * wave * mask * decay * intensity * 0.12;
             brightness += mask * max(0.0, wave) * decay * intensity * 0.18;
          }
        }
        vec4 color = texture2D(u_image, clamp(baseUV + offset, 0.0, 1.0));
        color.rgb += brightness * vec3(0.9, 0.95, 1.0);
        gl_FragColor = color;
      }
    `;
    const createShader = (gl, type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const tb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    const texCanvas = document.createElement('canvas');
    texCanvas.width = canvas.width;
    texCanvas.height = canvas.height;
    const ctx = texCanvas.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, texCanvas.width, texCanvas.height);
    ctx.fillStyle = '#242424';
    const text = 'CONTACT.';
    const baseFontSize = 100;
    ctx.font = `bold ${baseFontSize}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = (metrics.actualBoundingBoxAscent || baseFontSize * 0.75) +
                       (metrics.actualBoundingBoxDescent || baseFontSize * 0.25);
    const scaleX = (texCanvas.width * 1.35) / textWidth;
    const scaleY = (texCanvas.height * 1.35) / textHeight;
    ctx.save();
    ctx.translate(texCanvas.width / 2, texCanvas.height / 2);
    ctx.scale(scaleX, scaleY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uRipplesLoc = gl.getUniformLocation(program, 'u_ripples');
    const uCountLoc = gl.getUniformLocation(program, 'u_rippleCount');
    const uAspectLoc = gl.getUniformLocation(program, 'u_aspect');
    const uParallaxLoc = gl.getUniformLocation(program, 'u_parallax');
    gl.uniform1f(uAspectLoc, canvas.width / canvas.height);

    let rafId;
    let lastTime = performance.now();
    const render = () => {
      const cur = performance.now();
      const dt = (cur - lastTime) / 1000;
      lastTime = cur;
      const active = [];
      for (const r of ripplesRef.current) {
        r.time += dt;
        if (r.time < 2.5) active.push(r);
      }
      ripplesRef.current = active;
      const data = new Float32Array(20);
      active.forEach((r, i) => {
        if (i >= 5) return;
        data[i * 4] = r.x;
        data[i * 4 + 1] = r.y;
        data[i * 4 + 2] = r.time;
        data[i * 4 + 3] = r.intensity;
      });
      gl.uniform4fv(uRipplesLoc, data);
      gl.uniform1i(uCountLoc, Math.min(active.length, 5));

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const tx = ((mouseRef.current.x - cx) / window.innerWidth) * -0.05;
      const ty = ((mouseRef.current.y - cy) / window.innerHeight) * 0.05;
      currentParallax.current.x += (tx - currentParallax.current.x) * 0.05;
      currentParallax.current.y += (ty - currentParallax.current.y) * 0.05;
      gl.uniform2f(uParallaxLoc, currentParallax.current.x, currentParallax.current.y);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      gl.deleteProgram(program);
      gl.deleteTexture(texture);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full bg-black" />;
};

// --- DATA ---
const PROJECTS = REAL_PROJECTS;

const getYouTubeEmbedUrl = (url) => {
  const match = String(url).match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([^?&/]+)/);
  if (!match) return null;

  const timeMatch = String(url).match(/[?&]t=(?:(\d+)m)?(\d+)s?|[?&]start=(\d+)/);
  const start = timeMatch
    ? Number(timeMatch[3] || 0) + Number(timeMatch[1] || 0) * 60 + Number(timeMatch[2] || 0)
    : 0;
  const startParam = start > 0 ? `&start=${start}` : '';

  return `https://www.youtube.com/embed/${match[1]}?controls=1&modestbranding=1&rel=0&playsinline=1${startParam}`;
};

const getMediaType = (url) => {
  if (getYouTubeEmbedUrl(url)) return 'youtube';
  if (/\.(mp4|mov|m4v)$/i.test(url)) return 'video';
  return 'image';
};

const shouldCoverMedia = (mediaWidth, mediaHeight) => {
  if (!mediaWidth || !mediaHeight || typeof window === 'undefined') return false;
  const mediaAspect = mediaWidth / mediaHeight;
  const viewportAspect = window.innerWidth / window.innerHeight;
  const visibleRatio = Math.min(mediaAspect / viewportAspect, viewportAspect / mediaAspect);
  return visibleRatio >= 0.72;
};

const DetailMedia = ({ media, title, index }) => {
  const [fitMode, setFitMode] = useState('contain');
  const [dimensions, setDimensions] = useState(null);

  useEffect(() => {
    if (!dimensions) return;
    const updateFit = () => {
      setFitMode(shouldCoverMedia(dimensions.width, dimensions.height) ? 'cover' : 'contain');
    };
    updateFit();
    window.addEventListener('resize', updateFit);
    return () => window.removeEventListener('resize', updateFit);
  }, [dimensions]);

  const mediaClass =
    fitMode === 'cover'
      ? 'w-full h-full object-cover bg-black'
      : 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-10rem)] sm:max-w-[calc(100vw-5rem)] sm:max-h-[calc(100vh-12rem)] object-contain bg-black';

  if (media.type === 'youtube') {
    return (
      <div className="relative w-[min(92vw,1200px)] aspect-video bg-black shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <iframe
          src={media.embedUrl}
          title={`${title} video ${index + 1}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full bg-black"
        />
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-4 right-4 z-10 bg-white px-4 py-2 text-[10px] font-medium tracking-[0.25em] text-black uppercase transition-opacity hover:opacity-70"
        >
          Watch on YouTube
        </a>
      </div>
    );
  }

  if (media.type === 'video') {
    return (
      <video
        src={media.url}
        controls
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDimensions({
            width: e.currentTarget.videoWidth,
            height: e.currentTarget.videoHeight,
          });
        }}
        className={mediaClass}
      />
    );
  }

  return (
    <img
      src={media.url}
      alt=""
      onLoad={(e) => {
        setDimensions({
          width: e.currentTarget.naturalWidth,
          height: e.currentTarget.naturalHeight,
        });
      }}
      className={mediaClass}
      draggable={false}
    />
  );
};

// --- NAV ---
const Navigation = ({ onLogoClick, onAboutClick, onContactClick }) => (
  <nav className="fixed top-0 left-0 right-0 z-[60] px-6 sm:px-10 py-6 sm:py-8 mix-blend-difference text-white pointer-events-none">
    <div className="flex justify-between items-center">
      <button onClick={onLogoClick} className="pointer-events-auto hover:opacity-60 transition-opacity flex items-center" aria-label="Jvision home">
        <img src={jvisionLogo} alt="Jvision" className="h-7 w-auto" />
      </button>
      <div className="flex gap-6 sm:gap-10 pointer-events-auto">
        <button onClick={onAboutClick} className="text-[11px] tracking-[0.15em] hover:opacity-60 transition-opacity">ABOUT ME</button>
        <button onClick={onContactClick} className="text-[11px] tracking-[0.15em] hover:opacity-60 transition-opacity">CONTACT</button>
      </div>
    </div>
  </nav>
);

// --- ABOUT ---
const AboutView = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [volume, setVolume] = useState(60);
  const maskRef = useRef(null);
  const iframeRef = useRef(null);

  const postYT = (func, args = "") => {
    if (!iframeRef.current?.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args }), '*'
      );
    } catch (e) { console.error(e); }
  };

  const applyVolume = (v) => {
    if (v > 0) postYT("unMute");
    else postYT("mute");
    postYT("setVolume", [v]);
  };

  const unmuteVideo = () => {
    applyVolume(volume);
    postYT("playVideo");
  };

  const targetMouse = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  });
  const currentMouse = useRef({ ...targetMouse.current });
  const targetSize = useRef(25);
  const currentSize = useRef(25);

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { targetSize.current = isPressed ? 150 : 25; }, [isPressed]);

  useEffect(() => {
    let rafId;
    const tick = () => {
      currentMouse.current.x += (targetMouse.current.x - currentMouse.current.x) * 0.1;
      currentMouse.current.y += (targetMouse.current.y - currentMouse.current.y) * 0.1;
      currentSize.current += (targetSize.current - currentSize.current) * 0.08;
      if (maskRef.current) {
        maskRef.current.style.setProperty('--mouse-x', `${currentMouse.current.x}px`);
        maskRef.current.style.setProperty('--mouse-y', `${currentMouse.current.y}px`);
        maskRef.current.style.setProperty('--spotlight-size', `${currentSize.current}vw`);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleMouseMove = (e) => { targetMouse.current = { x: e.clientX, y: e.clientY }; };
  const handleTouchMove = (e) => { targetMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };

  const maskStyle = {
    WebkitMaskImage:
      'radial-gradient(circle var(--spotlight-size, 25vw) at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, black 30%, transparent 70%)',
    maskImage:
      'radial-gradient(circle var(--spotlight-size, 25vw) at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, black 30%, transparent 70%)',
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseDown={() => { setIsPressed(true); unmuteVideo(); }}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={(e) => { handleTouchMove(e); setIsPressed(true); unmuteVideo(); }}
      onTouchEnd={() => setIsPressed(false)}
      className={`fixed inset-0 z-[70] bg-white text-black select-none transition-opacity duration-700 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Hidden YouTube video revealed by spotlight */}
      <div ref={maskRef} className="absolute inset-0 overflow-hidden bg-black" style={maskStyle}>
        <iframe
          ref={iframeRef}
          src={ABOUT_VIDEO_URL}
          title="About background"
          allow="autoplay; encrypted-media; picture-in-picture"
          frameBorder="0"
          className="absolute top-1/2 left-1/2 pointer-events-none"
          style={{
            width: '177.78vh',
            height: '100vh',
            minWidth: '100vw',
            minHeight: '56.25vw',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Foreground typography (mix-blend-difference reads through) */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6 mix-blend-difference text-white pointer-events-none">
        <h1 className="font-bold leading-[0.85] tracking-tight text-[18vw]">Jvision</h1>
        <p className="mt-6 text-[11px] tracking-[0.4em] uppercase">Defining The Unseen</p>
        <p className="mt-16 text-[10px] tracking-[0.3em] opacity-80">[ HOLD TO REVEAL ]</p>
        <div className="mt-8 flex flex-wrap gap-8 justify-center text-[10px] tracking-[0.25em] uppercase opacity-70">
          <span>Visual Artist</span>
          <span>Est. 2026</span>
          <span>Stockholm / Global</span>
        </div>
      </div>

      {/* Volume controller — minimal, blends with vibe */}
      <div
        className="absolute bottom-8 right-8 sm:bottom-10 sm:right-10 z-20 flex items-center gap-3 px-4 py-2.5 rounded-full backdrop-blur-md bg-white/10 border border-white/20 text-white"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <span className="text-[9px] tracking-[0.3em] uppercase opacity-80">
          {volume === 0 ? 'Muted' : 'Vol'}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            applyVolume(v);
          }}
          className="jv-volume w-28 h-[2px] appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${CTA_COLOR} 0%, ${CTA_COLOR} ${volume}%, rgba(255,255,255,0.25) ${volume}%, rgba(255,255,255,0.25) 100%)`,
          }}
          aria-label="Volume"
        />
        <span className="text-[9px] tracking-[0.2em] tabular-nums opacity-80 w-6 text-right">
          {volume}
        </span>
      </div>

      <button
        onClick={() => { setIsVisible(false); setTimeout(onClose, 700); }}
        className="absolute top-8 right-8 sm:top-10 sm:right-10 text-[11px] tracking-[0.15em] text-white mix-blend-difference hover:opacity-50 transition-opacity z-20"
      >
        [ CLOSE ]
      </button>
    </div>
  );
};

// --- CONTACT ---
const ContactView = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [magnetPos, setMagnetPos] = useState({ x: 0, y: 0 });
  const [isCopied, setIsCopied] = useState(false);
  const [contactRipples, setContactRipples] = useState([]);
  const emailRef = useRef(null);

  useEffect(() => {
    const showTimer = setTimeout(() => setIsVisible(true), 50);
    const rippleTimer = setTimeout(() => {
      addContactRipple(window.innerWidth / 2, window.innerHeight / 2);
    }, 420);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(rippleTimer);
    };
  }, []);

  const handleMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (emailRef.current) {
      const rect = emailRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200) setMagnetPos({ x: dx * 0.2, y: dy * 0.2 });
      else setMagnetPos({ x: 0, y: 0 });
    }
  };

  const addContactRipple = (x, y) => {
    const id = Date.now() + Math.random();
    setContactRipples((ripples) => [...ripples.slice(-3), { id, x, y }]);
    setTimeout(() => {
      setContactRipples((ripples) => ripples.filter((ripple) => ripple.id !== id));
    }, 1200);
  };

  const handleContactClick = (e) => {
    addContactRipple(e.clientX, e.clientY);
  };

  const handleCopy = (e) => {
    addContactRipple(e.clientX, e.clientY);
    if (isCopied) return;
    const textToCopy = 'contact@jiechen.design';
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) { console.error(err); }
    document.body.removeChild(ta);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onClick={handleContactClick}
      className={`fixed inset-0 z-[70] bg-black text-white overflow-hidden transition-opacity duration-700 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      <style>{`
        @keyframes contact-type-ripple {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0.9; filter: blur(0px); }
          45% { opacity: 0.48; filter: blur(1px); }
          100% { transform: translate(-50%, -50%) scale(1.35); opacity: 0; filter: blur(4px); }
        }
      `}</style>

      <div
        aria-hidden="true"
        className="absolute inset-0 z-[2] flex items-center justify-center overflow-hidden pointer-events-none select-none"
      >
        <div className="font-black uppercase leading-none tracking-normal text-[20vw] text-white/16 whitespace-nowrap">
          CONTACT.
        </div>
      </div>

      {contactRipples.map((ripple) => (
        <div
          key={ripple.id}
          aria-hidden="true"
          className="absolute z-[3] flex items-center justify-center overflow-hidden pointer-events-none select-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: '120vw',
            height: '120vw',
            WebkitMaskImage: 'radial-gradient(circle, black 0%, black 36%, transparent 62%)',
            maskImage: 'radial-gradient(circle, black 0%, black 36%, transparent 62%)',
            animation: 'contact-type-ripple 1200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div className="font-black uppercase leading-none tracking-normal text-[20vw] text-white/32 whitespace-nowrap">
            CONTACT.
          </div>
        </div>
      ))}

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center pointer-events-none">
        <button
          ref={emailRef}
          onClick={handleCopy}
          style={{
            transform: `translate(${magnetPos.x}px, ${magnetPos.y}px)`,
            color: isCopied ? CTA_COLOR : undefined,
          }}
          className="pointer-events-auto text-[5vw] sm:text-[3.5vw] font-medium tracking-tight transition-[transform,color] duration-300 ease-out hover:opacity-80"
        >
          CONTACT@JIECHEN.DESIGN
        </button>
        <p
          style={{ color: CTA_COLOR }}
          className={`mt-6 text-[10px] tracking-[0.3em] transition-opacity duration-500 ${isCopied ? 'opacity-100' : 'opacity-0'}`}
        >
          [ COPIED TO CLIPBOARD ]
        </p>
      </div>

      <div
        className="absolute bottom-8 left-8 sm:bottom-10 sm:left-10 z-20 text-[10px] tracking-[0.25em] uppercase text-white mix-blend-difference"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
      >
        Stockholm, Sweden
      </div>

      <div
        className="absolute top-8 left-8 sm:top-10 sm:left-10 z-20 text-[10px] tracking-[0.25em] uppercase text-white mix-blend-difference flex gap-3 items-center"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
      >
        <span>Network</span>
        <a
          href="https://www.linkedin.com/in/jie-chen-1768a725/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: CTA_COLOR }}
          className="hover:opacity-80 transition-opacity font-semibold pointer-events-auto"
        >
          LinkedIn ↗
        </a>
      </div>

      <button
        onClick={() => { setIsVisible(false); setTimeout(onClose, 700); }}
        className="absolute top-8 right-8 sm:top-10 sm:right-10 text-[11px] tracking-[0.15em] text-white hover:opacity-50 transition-opacity z-20"
      >
        [ CLOSE ]
      </button>
    </div>
  );
};

// --- DETAIL ---
const DetailView = ({ project, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const isScrolling = useRef(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const mediaList = project.images.map((url) => ({
    url,
    type: getMediaType(url),
    embedUrl: getYouTubeEmbedUrl(url),
  }));

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleWheel = (e) => {
    if (showInfo || isScrolling.current) return;
    if (Math.abs(e.deltaY) > 25 || Math.abs(e.deltaX) > 25) {
      isScrolling.current = true;
      const dir = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (dir > 0 && currentIndex < mediaList.length - 1) setCurrentIndex((p) => p + 1);
      else if (dir < 0 && currentIndex > 0) setCurrentIndex((p) => p - 1);
      setTimeout(() => { isScrolling.current = false; }, 1000);
    }
  };
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e) => {
    if (showInfo || isScrolling.current) return;
    const dx = touchStartX.current - e.touches[0].clientX;
    const dy = touchStartY.current - e.touches[0].clientY;
    if (Math.abs(dx) > 40 || Math.abs(dy) > 40) {
      isScrolling.current = true;
      const dir = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (dir > 0 && currentIndex < mediaList.length - 1) setCurrentIndex((p) => p + 1);
      else if (dir < 0 && currentIndex > 0) setCurrentIndex((p) => p - 1);
      setTimeout(() => { isScrolling.current = false; }, 1000);
    }
  };

  if (!project) return null;

  return (
    <div
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className={`fixed inset-0 z-[70] bg-black text-white transition-opacity duration-700 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Media stack */}
      <div className="absolute inset-0 bg-black">
        {mediaList.map((media, idx) => (
          <div
            key={idx}
            className="absolute inset-0 flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.65,0,0.35,1)]"
            style={{
              opacity: idx === currentIndex ? 1 : 0,
              transform: `scale(${idx === currentIndex ? 1 : 1.05})`,
              pointerEvents: idx === currentIndex ? 'auto' : 'none',
            }}
          >
            <DetailMedia media={media} title={project.title} index={idx} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/30 pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Prev / Next arrows */}
      {currentIndex > 0 && (
        <button
          onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
          aria-label="Previous"
          className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition mix-blend-difference text-white"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {currentIndex < mediaList.length - 1 && (
        <button
          onClick={() => setCurrentIndex((p) => Math.min(mediaList.length - 1, p + 1))}
          aria-label="Next"
          className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition mix-blend-difference text-white"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 sm:px-10 py-6 sm:py-8 flex justify-between items-center pointer-events-none">
        <img src={jvisionLogo} alt="Jvision" className="h-6 w-auto mix-blend-difference" style={{ filter: 'brightness(0) invert(1)' }} />
        <div className="flex items-center gap-6 mix-blend-difference text-white">
          <button
            onClick={() => { setIsVisible(false); setTimeout(onClose, 700); }}
            className="text-[11px] tracking-[0.15em] font-medium pointer-events-auto hover:opacity-50 transition-opacity"
          >
            [ CLOSE ]
          </button>
          <span className="text-[11px] tracking-[0.15em] tabular-nums">
            {(currentIndex + 1).toString().padStart(2, '0')} / {mediaList.length.toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-6 sm:px-10 py-6 sm:py-8 flex justify-between items-end mix-blend-difference text-white">
        <div>
          <h2 className="text-2xl sm:text-4xl font-medium tracking-tight">{project.title}</h2>
          <p className="text-[11px] tracking-[0.25em] mt-2 opacity-70">{project.subtitle}</p>
        </div>
        <button
          onClick={() => setShowInfo(true)}
          className="text-[11px] tracking-[0.15em] font-medium pointer-events-auto hover:opacity-50 transition-opacity mb-2"
        >
          [ INFO ]
        </button>
      </div>

      {/* Info overlay */}
      <div
        className={`absolute inset-0 z-20 bg-black/95 backdrop-blur-md transition-opacity duration-500 ${showInfo ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={() => setShowInfo(false)}
          className="absolute top-8 right-8 sm:top-10 sm:right-10 text-[11px] tracking-[0.15em] hover:opacity-50 transition-opacity"
        >
          [ CLOSE INFO ]
        </button>
        <div className="h-full flex flex-col justify-center max-w-3xl mx-auto px-8">
          <p className="text-[11px] tracking-[0.3em] opacity-70 uppercase">{project.subtitle}</p>
          <h2 className="text-4xl sm:text-6xl font-medium tracking-tight mt-3">{project.title}</h2>
          <div className="mt-8 space-y-5 text-base sm:text-lg leading-relaxed opacity-90 max-w-2xl">
            <p>{project.description}</p>
            {project.context && <p>{project.context}</p>}
            {project.outcome && <p>{project.outcome}</p>}
          </div>
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl">
            <div>
              <p className="text-[10px] tracking-[0.25em] opacity-50 uppercase">Role</p>
              <p className="text-sm mt-2">{project.role}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.25em] opacity-50 uppercase">Client</p>
              <p className="text-sm mt-2">{project.client}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.25em] opacity-50 uppercase">Year</p>
              <p className="text-sm mt-2">{project.year}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.25em] opacity-50 uppercase">Tools</p>
              <p className="text-sm mt-2">{project.tools?.join(' / ')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function JvisionPortfolio() {
  const [activeProject, setActiveProject] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [, setClickedId] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const cardsRef = useRef([]);
  const targetScroll = useRef(0);
  const currentScroll = useRef(0);
  const hoveredIdRef = useRef(null);
  const clickedIdRef = useRef(null);

  const cardAnimData = useRef(PROJECTS.map(() => ({ scale: 1, hoverOpacity: 1, blurOffset: 0 })));

  useEffect(() => {
    let isDragging = false;
    let startY = 0;

    const handleWheel = (e) => {
      if (!activeProject && !isTransitioning) targetScroll.current += e.deltaY * 0.003;
    };
    const handleMouseDown = (e) => {
      if (!activeProject && !isTransitioning) { isDragging = true; startY = e.clientY; }
    };
    const handleMouseMove = (e) => {
      if (isDragging && !activeProject && !isTransitioning) {
        const d = startY - e.clientY;
        targetScroll.current += d * 0.005;
        startY = e.clientY;
      }
    };
    const handleMouseUp = () => { isDragging = false; };
    const handleTouchStart = (e) => { if (!activeProject && !isTransitioning) startY = e.touches[0].clientY; };
    const handleTouchMove = (e) => {
      if (!activeProject && !isTransitioning) {
        const d = startY - e.touches[0].clientY;
        targetScroll.current += d * 0.005;
        startY = e.touches[0].clientY;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [activeProject, isTransitioning]);

  useEffect(() => {
    let rafId;
    const total = PROJECTS.length;
    const tick = () => {
      currentScroll.current += (targetScroll.current - currentScroll.current) * 0.08;
      cardsRef.current.forEach((card, i) => {
        if (!card) return;
        const isHovered = hoveredIdRef.current === PROJECTS[i].id;
        const isClicked = clickedIdRef.current === PROJECTS[i].id;
        const isTransitioningCurrent = clickedIdRef.current !== null;
        const isAnyHovered = hoveredIdRef.current !== null;
        const anim = cardAnimData.current[i];

        let rawP = (i - currentScroll.current) % total;
        let p = rawP < 0 ? rawP + total : rawP;
        let centeredP = p - total / 2;

        const isMobile = window.innerWidth < 768;
        const spreadX = isMobile ? 70 : 120;
        const spreadY = isMobile ? -60 : -90;
        const spreadZ = isMobile ? -140 : -180;
        const tx = centeredP * spreadX;
        const ty = centeredP * spreadY;
        const tz = centeredP * spreadZ;
        const edgeDist = Math.min(p, total - p);
        const baseOpacity = Math.min(1, edgeDist * 1.5);
        const distFromCenter = Math.abs(centeredP);
        const defaultBlur = Math.max(0, distFromCenter * 1.5 - 1);

        const targetScale = isClicked ? 1.15 : isHovered ? 1.05 : 1;
        const targetHoverOpacity = isClicked ? 1 : isTransitioningCurrent ? 0.0 : isHovered ? 1 : isAnyHovered ? 0.2 : 1;
        const targetBlurOffset = isClicked ? 0 : isTransitioningCurrent ? 20 : isHovered ? -20 : isAnyHovered ? 8 : 0;

        anim.scale += (targetScale - anim.scale) * 0.1;
        if (Math.abs(targetScale - anim.scale) < 0.001) anim.scale = targetScale;
        const opacitySpeed = isTransitioningCurrent && !isClicked ? 0.15 : 0.1;
        anim.hoverOpacity += (targetHoverOpacity - anim.hoverOpacity) * opacitySpeed;
        if (Math.abs(targetHoverOpacity - anim.hoverOpacity) < 0.001) anim.hoverOpacity = targetHoverOpacity;
        anim.blurOffset += (targetBlurOffset - anim.blurOffset) * 0.1;
        if (Math.abs(targetBlurOffset - anim.blurOffset) < 0.01) anim.blurOffset = targetBlurOffset;

        const finalOpacity = baseOpacity * anim.hoverOpacity;
        const finalBlur = Math.max(0, defaultBlur + anim.blurOffset);
        const zIndex = isClicked ? 999 : Math.round(100 - p * 10);

        card.style.transform = `translate3d(calc(-50% + ${tx}px), calc(-50% + ${ty}px), ${tz}px) scale(${anim.scale})`;
        card.style.opacity = String(finalOpacity);
        card.style.filter = `blur(${finalBlur}px)`;
        card.style.zIndex = String(zIndex);
        const isGlobalTransitioning = clickedIdRef.current !== null;
        const isClickable = finalOpacity > 0.05 && (!isGlobalTransitioning || isClicked);
        card.style.pointerEvents = isClickable ? 'auto' : 'none';
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleMouseEnter = (id) => {
    if (isTransitioning) return;
    setHoveredId(id);
    hoveredIdRef.current = id;
  };
  const handleMouseLeave = () => {
    if (isTransitioning) return;
    setHoveredId(null);
    hoveredIdRef.current = null;
  };
  const handleProjectSelect = (e, project) => {
    if (isTransitioning || activeProject) return;
    setIsTransitioning(true);
    clickedIdRef.current = project.id;
    setClickedId(project.id);
    setTimeout(() => {
      setActiveProject(project);
      window.scrollTo(0, 0);
      setIsTransitioning(false);
      clickedIdRef.current = null;
      setClickedId(null);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-white overflow-hidden">
      <Navigation
        onLogoClick={() => { setActiveProject(null); setShowAbout(false); setShowContact(false); }}
        onAboutClick={() => { setShowAbout(true); setShowContact(false); }}
        onContactClick={() => { setShowContact(true); setShowAbout(false); }}
      />

      {/* Scene */}
      <div className="absolute inset-0" style={{ perspective: '1200px' }}>
        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
          {PROJECTS.map((project, index) => (
            <div
              key={project.id}
              ref={(el) => (cardsRef.current[index] = el)}
              onMouseEnter={() => handleMouseEnter(project.id)}
              onMouseLeave={handleMouseLeave}
              className="absolute top-1/2 left-1/2 group w-[180px] h-[250px] sm:w-[220px] sm:h-[300px] md:w-[32vh] md:h-[45vh] will-change-transform"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="relative w-full h-full overflow-hidden bg-neutral-900">
                <WebGLRippleImage
                  src={project.cover}
                  alt={project.title}
                  isHovered={hoveredId === project.id}
                  isClicked={clickedIdRef.current === project.id}
                  onClick={(e) => handleProjectSelect(e, project)}
                />
              </div>
              <div className="absolute left-[82%] top-1/2 hidden -translate-y-1/2 sm:block opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <p className="jv-project-title bg-white px-5 py-3 text-center text-[10px] font-medium tracking-[0.16em] text-neutral-900 uppercase shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
                  {project.title}
                </p>
              </div>
              <div className="absolute -bottom-8 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none sm:hidden">
                <p className="jv-project-title mx-auto text-[10px] tracking-[0.16em] uppercase">{project.title}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer scroll hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] opacity-40 pointer-events-none uppercase">
        Scroll · Drag · Click
      </div>

      {activeProject && <DetailView project={activeProject} onClose={() => setActiveProject(null)} />}
      {showAbout && <AboutView onClose={() => setShowAbout(false)} />}
      {showContact && <ContactView onClose={() => setShowContact(false)} />}
    </div>
  );
}
