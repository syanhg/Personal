// After the text fades in, trace type-specimen guides around each component, fade them out,
// and only then let the bio links' dashed underlines appear.
(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const START = 650;     // ms: wait for the text to finish fading in
    const SPREAD = 500;    // ms: stagger window for each set of lines
    const DRAW = 700;      // ms: matches .guide animation-duration
    const HOLD = 400;      // ms: pause on the finished grid before it fades

    const root = document.documentElement;
    root.classList.add('drawing');

    const bio = document.querySelector('.bio');
    const overlay = document.createElement('div');
    overlay.className = 'guides';
    overlay.setAttribute('aria-hidden', 'true');

    // Tight, pixel-snapped box around an element's text, not its full block width.
    const snap = r => ({
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
    });
    const textBox = el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return snap(range.getBoundingClientRect());
    };

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

    document.body.append(overlay);

    setTimeout(() => overlay.classList.add('done'), START + SPREAD + DRAW + HOLD);
    overlay.addEventListener('transitionend', () => {
        overlay.remove();
        root.classList.remove('drawing');
    }, { once: true });
})();
