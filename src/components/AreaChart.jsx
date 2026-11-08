import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { niceCeil } from "../utils/format";

const PAD = { l: 52, r: 10, t: 10, b: 22 };
const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

function rgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Lightweight canvas time-series chart.
 *  - series: [{ label, color: "--css-var", data: (number|null)[], fill?: boolean }]
 *  - yMax:   fixed max (e.g. 100) or omit to auto-scale with `niceFn`
 * Hover is handled imperatively (no React re-render on mouse move).
 */
function AreaChart({
  series,
  yMax,
  niceFn = niceCeil,
  formatY = String,
  formatTip = String,
  height = 170,
  label = "Chart",
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hoverRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: height });
  const propsRef = useRef({});
  propsRef.current = { series, yMax, niceFn, formatY, formatTip };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    const { w, h } = sizeRef.current;
    if (!canvas || !wrap || !w) return;

    const { series, yMax, niceFn, formatY, formatTip } = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const n = series[0]?.data.length ?? 0;
    if (n < 2) return;

    const pw = w - PAD.l - PAD.r;
    const ph = h - PAD.t - PAD.b;

    let max = yMax;
    if (max == null) {
      let m = 0;
      for (const s of series) for (const v of s.data) if (v != null && v > m) m = v;
      max = niceFn(m);
    }

    const X = (i) => PAD.l + (i / (n - 1)) * pw;
    const Y = (v) => PAD.t + ph * (1 - Math.min(Math.max(v, 0), max) / max);
    const grid = cssVar(wrap, "--grid");
    const muted = cssVar(wrap, "--muted");

    // grid + y labels
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = Math.round(PAD.t + (ph * k) / 4) + 0.5;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(w - PAD.r, y);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(formatY((max * (4 - k)) / 4), PAD.l - 8, y);
    }

    // x labels
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.fillText(`${n - 1}s ago`, PAD.l, h - 5);
    ctx.textAlign = "right";
    ctx.fillText("now", w - PAD.r, h - 5);

    // series
    for (const s of series) {
      const first = s.data.findIndex((v) => v != null);
      if (first < 0) continue;
      const color = cssVar(wrap, s.color);

      ctx.beginPath();
      for (let i = first; i < n; i++) {
        const v = s.data[i] ?? 0;
        i === first ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v));
      }
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = color;
      ctx.stroke();

      if (s.fill !== false) {
        ctx.lineTo(X(n - 1), PAD.t + ph);
        ctx.lineTo(X(first), PAD.t + ph);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + ph);
        g.addColorStop(0, rgba(color, 0.28));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    // hover crosshair + tooltip
    const idx = hoverRef.current;
    if (idx != null && series.some((s) => s.data[idx] != null)) {
      const x = X(idx);
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + ph);
      ctx.stroke();
      ctx.globalAlpha = 1;

      let rows = "";
      for (const s of series) {
        const v = s.data[idx];
        if (v == null) continue;
        ctx.beginPath();
        ctx.arc(x, Y(v), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = cssVar(wrap, s.color);
        ctx.fill();
        rows += `<div class="tip-row"><i style="background:var(${s.color})"></i>${s.label}<b>${formatTip(v)}</b></div>`;
      }
      const ago = n - 1 - idx;
      tip.innerHTML = `<div class="tip-time">${ago === 0 ? "now" : `${ago}s ago`}</div>${rows}`;
      tip.style.display = "block";
      tip.style.left = `${x}px`;
      tip.style.transform = idx > n * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)";
    } else if (tip) {
      tip.style.display = "none";
    }
  }, []);

  // size handling
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w, h: height };
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      draw();
    });
    ro.observe(wrap);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", draw);
    };
  }, [height, draw]);

  // redraw on new data
  useLayoutEffect(() => {
    draw();
  }, [series, yMax, draw]);

  const onMove = (e) => {
    const { w } = sizeRef.current;
    const n = propsRef.current.series[0]?.data.length ?? 0;
    if (!w || n < 2) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pw = w - PAD.l - PAD.r;
    const i = Math.round(((e.clientX - rect.left - PAD.l) / pw) * (n - 1));
    hoverRef.current = Math.min(n - 1, Math.max(0, i));
    draw();
  };
  const onLeave = () => {
    hoverRef.current = null;
    draw();
  };

  return (
    <div ref={wrapRef} className="chart-wrap" style={{ height }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      />
      <div ref={tipRef} className="chart-tip" />
    </div>
  );
}

export default memo(AreaChart);
