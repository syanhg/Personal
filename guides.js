// On load, draw type-specimen guides around each component, then fade them out.
(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const OVERSHOOT = 12;

    const bio = document.querySelector('.bio');
    const overlay = document.createElement('div');
    overlay.className = 'guides';
    overlay.setAttribute('aria-hidden', 'true');

    // Tight box around an element's text, not its full block width.
    const textBox = el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
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
        add('h', r.top, r.left - OVERSHOOT, r.right + OVERSHOOT);
        add('h', r.bottom, r.left - OVERSHOOT, r.right + OVERSHOOT);
        add('v', r.left, r.top - OVERSHOOT, r.bottom + OVERSHOOT);
        add('v', r.right, r.top - OVERSHOOT, r.bottom + OVERSHOOT);
    });

    // Links get stems that run through their own line.
    bio.querySelectorAll('a').forEach(el => {
        const r = el.getBoundingClientRect();
        const line = textBox(el.closest('h1, p'));
        add('v', r.left, line.top - OVERSHOOT, line.bottom + OVERSHOOT);
        add('v', r.right, line.top - OVERSHOOT, line.bottom + OVERSHOOT);
    });

    const line = (cls, s, delay, rev) => {
        const d = document.createElement('div');
        d.className = `guide ${cls}${rev ? ' rev' : ''}`;
        const [pos, start, size] = cls.startsWith('h') ? ['top', 'left', 'width'] : ['left', 'top', 'height'];
        d.style[pos] = `${Math.round(s.at)}px`;
        d.style[start] = `${Math.round(s.from)}px`;
        d.style[size] = `${Math.round(s.to - s.from)}px`;
        d.style.animationDelay = `${delay}ms`;
        overlay.append(d);
    };

    // Alternate the drawing direction and spread each set over ~600ms.
    ['h', 'v'].forEach(dir => {
        const list = segs[dir].sort((a, b) => a.at - b.at);
        const step = Math.min(45, 600 / list.length);
        list.forEach((s, i) => line(dir, s, i * step, i % 2));
    });

    // Solid frame above and below the whole block.
    const frame = bio.getBoundingClientRect();
    const span = { from: frame.left - OVERSHOOT * 2, to: frame.right + OVERSHOOT * 2 };
    line('h frame', { ...span, at: frame.top - 28 }, 0, false);
    line('h frame', { ...span, at: frame.bottom + 28 }, 0, true);

    document.body.append(overlay);

    setTimeout(() => overlay.classList.add('done'), 1800);
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
})();
