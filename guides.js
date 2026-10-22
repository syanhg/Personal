// On load, draw type-specimen guides along every component's edges, then fade them out.
(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

    const xs = [];
    const ys = [];
    const add = (list, v) => {
        if (!list.some(u => Math.abs(u - v) < 3)) list.push(Math.round(v));
    };

    bio.querySelectorAll('h1, p').forEach(el => {
        const r = textBox(el);
        add(ys, r.top);
        add(ys, r.bottom);
        add(xs, r.left);
        add(xs, r.right);
    });

    bio.querySelectorAll('a').forEach(el => {
        const r = el.getBoundingClientRect();
        add(xs, r.left);
        add(xs, r.right);
    });

    const line = (cls, prop, v, delay, rev) => {
        const d = document.createElement('div');
        d.className = `guide ${cls}${rev ? ' rev' : ''}`;
        d.style[prop] = `${v}px`;
        d.style.animationDelay = `${delay}ms`;
        overlay.append(d);
    };

    // Alternate the drawing direction and spread each set over ~600ms.
    const draw = (list, cls, prop) => {
        const step = Math.min(45, 600 / list.length);
        list.sort((a, b) => a - b).forEach((v, i) => line(cls, prop, v, i * step, i % 2));
    };

    draw(ys, 'h', 'top');
    draw(xs, 'v', 'left');

    // Solid frame above and below the whole block.
    const frame = bio.getBoundingClientRect();
    line('h frame', 'top', Math.round(frame.top - 28), 0, false);
    line('h frame', 'top', Math.round(frame.bottom + 28), 0, true);

    document.body.append(overlay);

    setTimeout(() => overlay.classList.add('done'), 1800);
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
})();
