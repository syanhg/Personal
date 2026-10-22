// The dice button rebuilds the page from random parts: an arrangement, where each piece lands,
// its size, and a colourway from the palette. Fonts stay as they are and nothing tilts.
// Pieces glide from their old spot to the new one. Escape puts everything back.
(() => {
    const root = document.documentElement;
    const main = document.querySelector('.bio');
    const button = document.querySelector('.shuffle');
    const icon = button.querySelector('svg');
    const pips = [...icon.querySelectorAll('[data-pip]')];
    const parts = {
        name: main.querySelector('h1'),
        links: main.querySelector('.links'),
        about: main.querySelector('.about'),
        email: main.querySelector('.email'),
    };
    const KEYS = Object.keys(parts);
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const pick = list => list[Math.floor(Math.random() * list.length)];
    const chance = p => Math.random() < p;
    const shuffled = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const weighted = pairs => {
        let r = Math.random() * pairs.reduce((sum, [, w]) => sum + w, 0);
        return (pairs.find(([, w]) => (r -= w) < 0) || pairs[0])[0];
    };
    const narrow = () => innerWidth < 640;

    const ALIGN = ['start', 'center', 'end'];
    const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' };

    // Each swatch with the stripe colour its palette card pairs it with.
    const PALETTE = [
        { color: '#a785fe', accent: '#eaa9cb' },  // Lavender / Pink Pearl
        { color: '#eaa9cb', accent: '#d5ef72' },  // Pink Pearl / Booger Buster
        { color: '#d5ef72', accent: '#00b65c' },  // Booger Buster / GO Green
        { color: '#00b65c', accent: '#f8311c' },  // GO Green / Red (RYB)
        { color: '#f8311c', accent: '#537cde' },  // Red (RYB) / United Nations Blue
        { color: '#537cde', accent: '#a785fe' },  // United Nations Blue / Lavender
    ];
    const INK = '#1d1d1b';
    const CREAM = '#f2efea';
    const DEEP = ['#f8311c', '#537cde'];  // dark enough to set text in on cream

    const colorway = () => {
        const swatch = pick(PALETTE);
        const deep = pick(DEEP);
        return weighted([
            [{ bg: swatch.color, ink: INK, hl: swatch.accent }, 4],  // the swatch as the page, its stripe as highlight
            [{ bg: CREAM, ink: INK, hl: swatch.color }, 3],          // cream card with the swatch as highlight
            [{ bg: CREAM, ink: deep, hl: `color-mix(in srgb, ${deep} 14%, transparent)` }, 2],
        ]);
    };

    // Drop each piece into a free cell of a cols × rows grid. Wide pieces go first so they always fit.
    const cells = (cols, rows, spans = {}) => {
        const taken = new Set();
        const fits = (c, r, w) => [...Array(w).keys()].every(i => !taken.has(`${c + i},${r}`));
        const place = {};
        shuffled(KEYS)
            .sort((a, b) => (spans[b] || 1) - (spans[a] || 1))
            .forEach(key => {
                const w = Math.min(spans[key] || 1, cols);
                const options = [];
                for (let r = 1; r <= rows; r++) {
                    for (let c = 1; c <= cols - w + 1; c++) if (fits(c, r, w)) options.push([c, r]);
                }
                const [c, r] = pick(options);
                for (let i = 0; i < w; i++) taken.add(`${c + i},${r}`);
                place[key] = { col: `${c} / span ${w}`, row: `${r}`, justify: pick(ALIGN), align: pick(ALIGN) };
            });
        return place;
    };

    const ARRANGEMENTS = {
        // One column in a random order: hugging a side or zigzagging, bunched up or spread out.
        column: () => {
            const side = pick(ALIGN);
            const zigzag = chance(0.35);
            const place = {};
            shuffled(KEYS).forEach((key, i) => {
                place[key] = { col: '1', row: `${i + 1}`, justify: zigzag ? (i % 2 ? 'end' : 'start') : side, align: 'center' };
            });
            return { columns: 'minmax(0, 1fr)', rows: 'repeat(4, auto)', alignContent: pick(['center', 'space-between', 'start', 'end']), place };
        },

        // Random cells on a coarse grid; the bio can stretch across two columns.
        grid: () => {
            const cols = narrow() ? 2 : pick([3, 4]);
            const rows = pick([3, 4, 5]);
            return {
                columns: `repeat(${cols}, minmax(0, 1fr))`,
                rows: `repeat(${rows}, 1fr)`,
                alignContent: 'stretch',
                place: cells(cols, rows, { about: narrow() ? 2 : pick([1, 2]) }),
            };
        },

        // A staircase from one corner down to the opposite one.
        diagonal: () => {
            const n = narrow() ? 2 : 4;
            const down = chance(0.5);
            const place = {};
            shuffled(KEYS).forEach((key, i) => {
                const step = narrow() ? i % 2 : i;
                const col = down ? step + 1 : n - step;
                const wide = key === 'about' && !narrow();
                place[key] = {
                    col: wide ? `${Math.min(col, n - 1)} / span 2` : `${col}`,
                    row: `${i + 1}`,
                    justify: down ? 'start' : 'end',
                    align: 'center',
                };
            });
            return { columns: `repeat(${n}, minmax(0, 1fr))`, rows: 'repeat(4, 1fr)', place };
        },

        // Everything side by side in a single row (wide screens only).
        row: () => {
            const order = shuffled(KEYS);
            const align = pick(['start', 'center', 'end']);
            const justify = pick(ALIGN);
            const place = {};
            order.forEach((key, i) => (place[key] = { col: `${i + 1}`, row: '1', justify, align }));
            return {
                columns: order.map(k => (k === 'about' ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)')).join(' '),
                rows: 'auto',
                alignContent: 'center',
                place,
            };
        },

        // The name blown up to poster size, everything else small above or below it.
        poster: () => {
            const nameOnTop = chance(0.5);
            const cols = narrow() ? 1 : 3;
            const place = {
                name: { col: '1 / -1', row: nameOnTop ? '1' : `${narrow() ? 4 : 2}`, justify: pick(ALIGN), align: nameOnTop ? 'end' : 'start' },
            };
            shuffled(KEYS.filter(k => k !== 'name')).forEach((key, i) => {
                place[key] = {
                    col: narrow() ? '1' : `${i + 1}`,
                    row: narrow() ? `${nameOnTop ? i + 2 : i + 1}` : (nameOnTop ? '2' : '1'),
                    justify: pick(ALIGN),
                    align: nameOnTop ? 'start' : 'end',
                };
            });
            return { columns: `repeat(${cols}, minmax(0, 1fr))`, rows: 'none', alignContent: pick(['center', 'space-between']), place, poster: true };
        },

        // Two halves: name and socials on one side, bio and email on the other (wide screens only).
        split: () => {
            const [a, b] = chance(0.5) ? [1, 2] : [2, 1];
            const inward = chance(0.5);  // hug the middle seam, or the outer edges
            const side = col => (inward === (col === 1) ? 'end' : 'start');
            const place = {
                name: { col: `${a}`, row: '1', justify: side(a), align: 'end' },
                links: { col: `${a}`, row: '2', justify: side(a), align: 'start' },
                about: { col: `${b}`, row: '1', justify: side(b), align: 'end' },
                email: { col: `${b}`, row: '2', justify: side(b), align: 'start' },
            };
            return { columns: 'repeat(2, minmax(0, 1fr))', rows: 'repeat(2, auto)', alignContent: pick(['center', 'start', 'end']), place };
        },

        // Loose on a fine grid, pieces sprinkled far apart.
        scatter: () => {
            const cols = narrow() ? 2 : 5;
            return {
                columns: `repeat(${cols}, minmax(0, 1fr))`,
                rows: 'repeat(6, 1fr)',
                alignContent: 'stretch',
                place: cells(cols, 6, { about: 2 }),
            };
        },
    };
    const WIDE_ONLY = ['row', 'split'];

    const TREATMENTS = [['none', 5], ['marker', 2], ['boxed', 1.5]];

    const set = (el, props) => Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v));

    const reset = () => {
        main.classList.remove('shuffled');
        main.removeAttribute('style');
        Object.values(parts).forEach(el => el.removeAttribute('style'));
        ['--ink', '--bg', '--hl'].forEach(k => root.style.removeProperty(k));
        delete root.dataset.theme;
    };

    let last = null;
    const randomize = () => {
        const options = Object.keys(ARRANGEMENTS).filter(n => !(narrow() && WIDE_ONLY.includes(n)));
        let arrangement;
        do arrangement = pick(options); while (arrangement === last);
        last = arrangement;
        const layout = ARRANGEMENTS[arrangement]();

        reset();
        main.classList.add('shuffled');
        set(main, {
            'grid-template-columns': layout.columns,
            'grid-template-rows': layout.rows,
            'align-content': layout.alignContent || 'center',
        });

        KEYS.forEach(key => {
            const p = layout.place[key];
            set(parts[key], {
                'grid-column': p.col,
                'grid-row': p.row,
                'justify-self': p.justify,
                'align-self': p.align,
                'text-align': TEXT_ALIGN[p.justify],
                '--s': key === 'name' ? pick([1, 1.4, 2, 2.6]) : pick([0.85, 1, 1, 1.2]),
            });
        });

        if (layout.poster) {
            set(parts.name, { 'font-size': 'clamp(44px, 11vw, 200px)', 'line-height': '0.92' });
        }
        if (chance(0.3)) {
            set(parts.links, { display: 'flex', 'flex-direction': 'column', 'align-items': layout.place.links.justify, gap: '6px' });
        }

        const { bg, ink, hl } = colorway();
        set(root, { '--bg': bg, '--ink': ink, '--hl': hl });
        const treatment = weighted(TREATMENTS);
        if (treatment !== 'none') root.dataset.theme = treatment;
    };

    // Measure, change, then play each piece from where it was to where it is now (FLIP).
    const flip = change => {
        const before = new Map(Object.values(parts).map(el => [el, el.getBoundingClientRect()]));
        change();
        if (reduceMotion) return;
        Object.values(parts).forEach((el, i) => {
            const a = before.get(el);
            const b = el.getBoundingClientRect();
            el.animate(
                [
                    { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`, opacity: 0.4 },
                    { transform: 'none', opacity: 1 },
                ],
                { duration: 650, delay: i * 45, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.15)', fill: 'backwards' },
            );
        });
    };

    // Pips by position: top/middle/bottom × left/centre/right.
    const FACES = {
        1: ['c'],
        2: ['tl', 'br'],
        3: ['tl', 'c', 'br'],
        4: ['tl', 'tr', 'bl', 'br'],
        5: ['tl', 'tr', 'c', 'bl', 'br'],
        6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
    };

    // Spin the die a full turn and land on a different face each time.
    let turns = 0;
    let face = 5;
    const roll = () => {
        let next;
        do next = 1 + Math.floor(Math.random() * 6); while (next === face);
        face = next;
        icon.style.rotate = `${++turns * 360}deg`;
        pips.forEach(pip => pip.classList.toggle('off', !FACES[face].includes(pip.dataset.pip)));
    };

    button.addEventListener('click', () => {
        roll();
        flip(randomize);
    });

    addEventListener('keydown', e => {
        if (e.key === 'Escape' && main.classList.contains('shuffled')) flip(reset);
    });
})();
