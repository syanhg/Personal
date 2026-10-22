// After the text fades in, trace type-specimen guides around each component, then fade them out.
(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const START = 650;     // ms: wait for the text to finish fading in
    const SPREAD = 500;    // ms: stagger window for each set of lines
    const FRAME_PAD = 28;

    const bio = document.querySelector('.bio');
    const overlay = document.createElement('div');
    overlay.className = 'guides';
    overlay.setAttribute('aria-hidden', 'true');

    // Tight, pixel-snapped box around an element's text, not its full block width.
    const textBox = el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
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

    const rect = r => {
        add('h', r.top, r.left, r.right);
        add('h', r.bottom, r.left, r.right);
        add('v', r.left, r.top, r.bottom);
        add('v', r.right, r.top, r.bottom);
    };

    bio.querySelectorAll('h1, p').forEach(el => rect(textBox(el)));

    // Each link splits its line into cells: edges run exactly from the line's top to its bottom.
    bio.querySelectorAll('a').forEach(el => {
        const r = el.getBoundingClientRect();
        const line = textBox(el.closest('h1, p'));
        add('v', Math.round(r.left), line.top, line.bottom);
        add('v', Math.round(r.right), line.top, line.bottom);
    });

    // +1 so the end of each line covers the corner pixel and the rectangles close.
    const line = (cls, s, delay) => {
        const d = document.createElement('div');
        d.className = `guide ${cls}`;
        const [pos, start, size] = cls.startsWith('h') ? ['top', 'left', 'width'] : ['left', 'top', 'height'];
        d.style[pos] = `${s.at}px`;
        d.style[start] = `${s.from}px`;
        d.style[size] = `${s.to - s.from + 1}px`;
        d.style.animationDelay = `${delay}ms`;
        overlay.append(d);
    };

    ['h', 'v'].forEach(dir => {
        const list = segs[dir].sort((a, b) => a.at - b.at);
        const step = Math.min(45, SPREAD / list.length);
        list.forEach((s, i) => line(dir, s, START + i * step));
    });

    // Solid frame around the whole block, drawn last.
    const b = bio.getBoundingClientRect();
    const f = {
        top: Math.round(b.top - FRAME_PAD),
        bottom: Math.round(b.bottom + FRAME_PAD),
        left: Math.round(b.left - FRAME_PAD),
        right: Math.round(b.right + FRAME_PAD),
    };
    const frameAt = START + SPREAD;
    line('h frame', { at: f.top, from: f.left, to: f.right }, frameAt);
    line('h frame', { at: f.bottom, from: f.left, to: f.right }, frameAt);
    line('v frame', { at: f.left, from: f.top, to: f.bottom }, frameAt);
    line('v frame', { at: f.right, from: f.top, to: f.bottom }, frameAt);

    document.body.append(overlay);

    setTimeout(() => overlay.classList.add('done'), frameAt + 1400);
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
})();
