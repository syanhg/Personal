// After the text fades in, trace type-specimen guides around each component; they stay once drawn.
(() => {
    const START = 650;     // ms: wait for the text to finish fading in
    const SPREAD = 500;    // ms: stagger window for each set of lines

    const bio = document.querySelector('.bio');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Tight, pixel-snapped page box around an element's text, not its full block width.
    const snap = r => ({
        top: Math.round(r.top + scrollY),
        bottom: Math.round(r.bottom + scrollY),
        left: Math.round(r.left + scrollX),
        right: Math.round(r.right + scrollX),
    });
    const textBox = el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return snap(range.getBoundingClientRect());
    };

    const build = animate => {
        // Segments keyed by orientation; ones on the same line that overlap merge into one.
        const segs = { h: [], v: [] };
        const add = (dir, at, from, to) => {
            const same = segs[dir].find(s => Math.abs(s.at - at) < 3 && from <= s.to && to >= s.from);
            if (same) {
                same.from = Math.min(same.from, from);
                same.to = Math.max(same.to, to);
            } else {
                segs[dir].push({ at, from, to });
            }
        };

        bio.querySelectorAll('h1, p').forEach(el => {
            const r = textBox(el);
            add('h', r.top, r.left, r.right);
            add('h', r.bottom, r.left, r.right);
            add('v', r.left, r.top, r.bottom);
            add('v', r.right, r.top, r.bottom);
        });

        // Each link splits its line into cells: edges run exactly from the line's top to its bottom.
        bio.querySelectorAll('a').forEach(el => {
            const r = snap(el.getBoundingClientRect());
            const line = textBox(el.closest('h1, p'));
            add('v', r.left, line.top, line.bottom);
            add('v', r.right, line.top, line.bottom);
        });

        const overlay = document.createElement('div');
        overlay.className = animate ? 'guides' : 'guides static';
        overlay.setAttribute('aria-hidden', 'true');

        // +1 so the end of each line covers the corner pixel and the rectangles close.
        ['h', 'v'].forEach(dir => {
            const [pos, start, size] = dir === 'h' ? ['top', 'left', 'width'] : ['left', 'top', 'height'];
            const list = segs[dir].sort((a, b) => a.at - b.at);
            const step = Math.min(45, SPREAD / list.length);
            list.forEach((s, i) => {
                const d = document.createElement('div');
                d.className = `guide ${dir}`;
                d.style[pos] = `${s.at}px`;
                d.style[start] = `${s.from}px`;
                d.style[size] = `${s.to - s.from + 1}px`;
                d.style.animationDelay = `${START + i * step}ms`;
                overlay.append(d);
            });
        });

        return overlay;
    };

    let overlay = build(!reduceMotion);
    document.body.append(overlay);

    // The lines stay, so redraw them (without animating) when the layout changes.
    let pending = false;
    addEventListener('resize', () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            const next = build(false);
            overlay.replaceWith(next);
            overlay = next;
        });
    });
})();
