// Trace a rounded outline around the bio that follows each line's width, so two centered
// lines of different lengths read as a hat: narrow crown on top, wider brim below.
(() => {
    const PAD_X = 16;      // px past each line's ends; matches .about horizontal padding
    const PAD_Y = 10;      // px above the first line and below the last; matches .about vertical padding
    const RADIUS = 14;
    const MERGE = 6;       // px: lines closer than this in half-width share one step

    const about = document.querySelector('.about');
    const path = about.querySelector('.outline path');

    // One row per rendered line, from every text and link fragment on it.
    const rows = box => {
        const out = [];
        about.querySelectorAll('p').forEach(p => {
            const range = document.createRange();
            range.selectNodeContents(p);
            [...range.getClientRects()].filter(r => r.width > 0).forEach(r => {
                const row = out.find(o => Math.abs(o.top - r.top) < 4);
                if (row) {
                    row.left = Math.min(row.left, r.left);
                    row.right = Math.max(row.right, r.right);
                    row.bottom = Math.max(row.bottom, r.bottom);
                } else {
                    out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
                }
            });
        });
        const cx = box.left + box.width / 2;
        return out
            .sort((a, b) => a.top - b.top)
            .map(o => ({ top: o.top - box.top, bottom: o.bottom - box.top, half: Math.max(cx - o.left, o.right - cx) + PAD_X }))
            .reduce((merged, row) => {
                const last = merged[merged.length - 1];
                if (last && Math.abs(last.half - row.half) < MERGE) {
                    last.bottom = row.bottom;
                    last.half = Math.max(last.half, row.half);
                } else {
                    merged.push(row);
                }
                return merged;
            }, []);
    };

    // Each corner becomes a quadratic curve, clamped so short steps stay smooth.
    const rounded = pts => {
        const fmt = p => p.map(v => v.toFixed(1)).join(' ');
        return pts.map((p, i) => {
            const a = pts[(i - 1 + pts.length) % pts.length];
            const c = pts[(i + 1) % pts.length];
            const da = Math.hypot(a[0] - p[0], a[1] - p[1]);
            const dc = Math.hypot(c[0] - p[0], c[1] - p[1]);
            const k = Math.min(RADIUS, da / 2, dc / 2);
            const p1 = [p[0] + (a[0] - p[0]) * k / da, p[1] + (a[1] - p[1]) * k / da];
            const p2 = [p[0] + (c[0] - p[0]) * k / dc, p[1] + (c[1] - p[1]) * k / dc];
            return `${i ? 'L' : 'M'}${fmt(p1)} Q${fmt(p)} ${fmt(p2)}`;
        }).join(' ') + ' Z';
    };

    const draw = () => {
        const box = about.getBoundingClientRect();
        const r = rows(box);
        if (!r.length) return;

        const cx = box.width / 2;
        const top = r[0].top - PAD_Y;
        const bottom = r[r.length - 1].bottom + PAD_Y;

        // Right side top to bottom, stepping at the midpoint between lines; left side mirrors it.
        const right = [[cx + r[0].half, top]];
        r.slice(1).forEach((row, i) => {
            const y = (r[i].bottom + row.top) / 2;
            right.push([cx + r[i].half, y], [cx + row.half, y]);
        });
        right.push([cx + r[r.length - 1].half, bottom]);
        const left = right.map(([x, y]) => [2 * cx - x, y]).reverse();

        path.setAttribute('d', rounded([...right, ...left]));
    };

    draw();

    let pending = false;
    addEventListener('resize', () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            draw();
        });
    });
})();
