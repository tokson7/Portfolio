(function () {
  'use strict';

  const canvas      = document.getElementById('ropeCanvas');
  const sticker     = document.getElementById('stickerEl');
  const hardwareSvg = document.getElementById('hardwareSvg');
  if (!canvas || !sticker) return;

  const ctx = canvas.getContext('2d');

  // ─── Canvas resize ────────────────────────────────────────────────
  let dpr = window.devicePixelRatio || 1;
  let W, H;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Re-anchor after resize
    anchor.x = W / 2;
    anchor.y = 64;
    ropePoints[0].x  = anchor.x;
    ropePoints[0].y  = anchor.y;
    ropePoints[0].px = anchor.x;
    ropePoints[0].py = anchor.y;
  }

  // ─── Physics config ───────────────────────────────────────────────
  const ROPE_SEGMENTS        = 14;
  const SEGMENT_LENGTH       = 22;
  const GRAVITY              = 0.52;
  const DAMPING              = 0.988;
  const CONSTRAINT_ITERS     = 10;
  const STICKER_W            = 280;   // matches CSS width
  const GROMMET_X            = 140;   // grommet center X within sticker (width/2)
  const GROMMET_Y            = 28;    // grommet center Y from sticker top

  // ── Hardware SVG geometry (viewBox 0 0 60 92) ─────────────────────
  // Chain anchor  = top-center of hardware = (30, 0) in SVG space
  // Hook mouth    = where grommet clips on = approximately (20, 73) in SVG space
  // Rigid length  = sqrt((30-20)²+(0-73)²) ≈ 74px  (used for last rope segment)
  const HW_TOP_CX       = 30;    // SVG x of hardware top-center
  const HW_MOUTH_X      = 20;    // SVG x of hook mouth (local)
  const HW_MOUTH_Y      = 73;    // SVG y of hook mouth (local)
  const HARDWARE_LENGTH = Math.round(
    Math.sqrt((HW_TOP_CX - HW_MOUTH_X) ** 2 + HW_MOUTH_Y ** 2)
  );                              // ≈ 74

  // How many rope points from end to stop drawing the canvas lanyard
  // (hardware SVG covers the last segment visually)
  const ROPE_DRAW_STOP = 1;      // stop at second-to-last point (= chain anchor)

  // ─── Anchor ───────────────────────────────────────────────────────
  const anchor = {
    x: (window.innerWidth  || 800) / 2,
    y: 64,
  };

  // ─── Rope points ──────────────────────────────────────────────────
  // Start fully coiled at anchor so the drop-in looks dramatic
  const ropePoints = [];
  for (let i = 0; i <= ROPE_SEGMENTS; i++) {
    const p = {
      x: anchor.x,
      y: anchor.y,
      px: anchor.x,
      py: anchor.y - 0.1, // tiny downward priming velocity
      pinned: i === 0,
    };
    ropePoints.push(p);
  }

  // ─── Sticker angle ────────────────────────────────────────────────
  let stickerAngle    = 0; // degrees
  let prevStickerAngle = 0;

  // ─── Drag state ───────────────────────────────────────────────────
  let isDragging   = false;
  let dragOffsetX  = 0;
  let dragOffsetY  = 0;
  let targetX, targetY;

  // Mouse velocity window for slingshot
  const VEL_WINDOW = 6;
  const velHistory = []; // {x, y, t}

  // ─── Input handling ───────────────────────────────────────────────
  sticker.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    isDragging = true;
    sticker.setPointerCapture(e.pointerId);
    sticker.style.cursor = 'grabbing';

    // Drag offset: pointer relative to grommet center (stickerPoint world coords)
    const rect = sticker.getBoundingClientRect();
    dragOffsetX = e.clientX - (rect.left + GROMMET_X);
    dragOffsetY = e.clientY - (rect.top  + GROMMET_Y);

    velHistory.length = 0;
    velHistory.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  });

  document.addEventListener('pointermove', function (e) {
    if (!isDragging) return;
    targetX = e.clientX - dragOffsetX;
    targetY = e.clientY - dragOffsetY;

    velHistory.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (velHistory.length > VEL_WINDOW) velHistory.shift();
  });

  document.addEventListener('pointerup', function (e) {
    if (!isDragging) return;
    isDragging = false;
    sticker.style.cursor = 'grab';

    // Compute slingshot velocity from mouse movement history
    if (velHistory.length >= 2) {
      const newest = velHistory[velHistory.length - 1];
      const oldest = velHistory[0];
      const dt = (newest.t - oldest.t) / 1000; // seconds

      if (dt > 0.001) {
        const speed = 0.06;
        const vx = ((newest.x - oldest.x) / dt) * speed;
        const vy = ((newest.y - oldest.y) / dt) * speed;

        // Apply velocity impulse to last few rope points for natural whip
        for (let i = ROPE_SEGMENTS - 2; i <= ROPE_SEGMENTS; i++) {
          const factor = (i - (ROPE_SEGMENTS - 3)) / 3; // 0→1 taper
          const p = ropePoints[i];
          p.px = p.x - vx * factor;
          p.py = p.y - vy * factor;
        }
      }
    }
  });

  // ─── Verlet integration ───────────────────────────────────────────
  function updatePhysics() {
    // 1. Apply gravity + integrate velocity
    for (let i = 1; i <= ROPE_SEGMENTS; i++) {
      const p = ropePoints[i];
      if (p.pinned) continue;

      // Skip position update for last point if dragging (mouse controls it)
      if (isDragging && i === ROPE_SEGMENTS) continue;

      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY;
    }

    // 2. Direct mouse control of last point during drag
    if (isDragging && targetX !== undefined) {
      const last = ropePoints[ROPE_SEGMENTS];
      // Lerp for smoothness
      last.x += (targetX - last.x) * 0.55;
      last.y += (targetY - last.y) * 0.55;
    }

    // 3. Re-pin anchor — parallax: anchor drifts up as user scrolls so
    //    the sticker stays near the top section and leaves before cards.
    anchor.y = Math.max(-300, 64 - window.scrollY * 0.45);
    ropePoints[0].x  = anchor.x;
    ropePoints[0].y  = anchor.y;

    // 4. Constraint solver — all segments use SEGMENT_LENGTH,
    //    EXCEPT the last segment which is a rigid hardware piece
    for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
      for (let i = 0; i < ROPE_SEGMENTS; i++) {
        const p1       = ropePoints[i];
        const p2       = ropePoints[i + 1];
        const segLen   = (i === ROPE_SEGMENTS - 1) ? HARDWARE_LENGTH : SEGMENT_LENGTH;

        const dx   = p2.x - p1.x;
        const dy   = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

        const diff    = (dist - segLen) / dist;
        const offsetX = dx * 0.5 * diff;
        const offsetY = dy * 0.5 * diff;

        if (!p1.pinned) {
          p1.x += offsetX;
          p1.y += offsetY;
        }
        // Don't push last point if user is dragging it
        if (!(isDragging && i === ROPE_SEGMENTS - 1)) {
          p2.x -= offsetX;
          p2.y -= offsetY;
        }
      }
    }

    // 5. Chain angle from the last rigid segment (hardware direction)
    //    chainAnchor = second-to-last point, stickerPoint = last point
    const chainAnchorP  = ropePoints[ROPE_SEGMENTS - 1];
    const stickerPointP = ropePoints[ROPE_SEGMENTS];
    const angle = Math.atan2(
      stickerPointP.x - chainAnchorP.x,
      stickerPointP.y - chainAnchorP.y
    );
    prevStickerAngle = stickerAngle;
    stickerAngle = -angle * (180 / Math.PI);
  }

  // ─── Render ───────────────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, W, H);

    if (ropePoints.length < 2) return;

    // ── Shared chain points ───────────────────────────────────────
    // chainAnchor  = where rope ends / hardware top attaches
    // stickerPoint = where hardware hook mouth is / sticker grommet sits
    const chainAnchor  = ropePoints[ROPE_SEGMENTS - 1];
    const stickerPoint = ropePoints[ROPE_SEGMENTS];

    // Angle of the rigid hardware segment (in degrees, for CSS rotation)
    const chainDx    = stickerPoint.x - chainAnchor.x;
    const chainDy    = stickerPoint.y - chainAnchor.y;
    const chainAngle = -Math.atan2(chainDx, chainDy) * (180 / Math.PI);

    // ── Draw lanyard rope (anchor → chainAnchor) ──────────────────
    const drawTo = ROPE_SEGMENTS - ROPE_DRAW_STOP; // = ROPE_SEGMENTS - 1

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // Black lanyard base
    ctx.strokeStyle = '#0e0e0e';
    ctx.lineWidth   = 11;
    ctx.beginPath();
    ctx.moveTo(ropePoints[0].x, ropePoints[0].y);
    for (let i = 1; i <= drawTo; i++) ctx.lineTo(ropePoints[i].x, ropePoints[i].y);
    ctx.stroke();

    // Cyan dashed accent
    ctx.strokeStyle = '#7B9EC0';
    ctx.lineWidth   = 2.2;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.moveTo(ropePoints[0].x, ropePoints[0].y);
    for (let i = 1; i <= drawTo; i++) ctx.lineTo(ropePoints[i].x, ropePoints[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Metal anchor bracket at ceiling ──────────────────────────
    const ax = anchor.x, ay = anchor.y;
    ctx.save();
    ctx.fillStyle   = '#1c1c1c';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath(); ctx.roundRect(ax - 11, ay - 18, 22, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(ax - 11, ay - 18, 22, 8, [4, 4, 0, 0]); ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(ax - 6, ay - 14, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ax + 6, ay - 14, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ── Position hardware SVG ─────────────────────────────────────
    // Top-center of hardware (HW_TOP_CX=30, y=0 in SVG space) = chainAnchor world
    // Translate so SVG top-left puts (30,0) at chainAnchor, then rotate around (30,0)
    if (hardwareSvg) {
      const hx = chainAnchor.x - HW_TOP_CX;
      const hy = chainAnchor.y;            // SVG y=0 → chainAnchor.y
      hardwareSvg.style.transformOrigin = `${HW_TOP_CX}px 0px`;
      hardwareSvg.style.transform =
        `translate(${hx}px, ${hy}px) rotate(${chainAngle}deg)`;
    }

    // ── Position sticker DOM element ─────────────────────────────
    // Grommet center = stickerPoint world coords
    // sticker top-left = stickerPoint - (GROMMET_X, GROMMET_Y)
    const tx = stickerPoint.x - GROMMET_X;
    const ty = stickerPoint.y - GROMMET_Y;
    sticker.style.transformOrigin = `${GROMMET_X}px ${GROMMET_Y}px`;
    sticker.style.transform = `translate(${tx}px, ${ty}px) rotate(${chainAngle}deg)`;
  }

  // ─── Main loop ───────────────────────────────────────────────────
  let running     = true;
  let lastTime    = null;
  let accumulator = 0;
  const FIXED_DT  = 1 / 60; // physics always runs at 60 Hz equivalent

  function loop(ts) {
    if (!running) return;

    if (lastTime === null) lastTime = ts;
    const elapsed = Math.min((ts - lastTime) * 0.001, 0.1); // cap at 100ms to avoid spiral
    lastTime = ts;
    accumulator += elapsed;

    // Run as many fixed physics steps as needed to catch up with real time
    while (accumulator >= FIXED_DT) {
      updatePhysics();
      accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(loop);
  }

  // ─── Init ─────────────────────────────────────────────────────────
  resize();
  window.addEventListener('resize', resize);

  // Small sideways nudge so drop is not perfectly vertical (more interesting)
  setTimeout(function () {
    ropePoints[ROPE_SEGMENTS].px = anchor.x + 3;
  }, 80);

  requestAnimationFrame(loop);

  // Expose for debugging
  window.__stickerPhysics = { ropePoints, anchor };
})();
