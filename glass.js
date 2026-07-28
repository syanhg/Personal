// A pane of liquid glass across the top and bottom of the viewport. Videos
// scrolling through those strips are refracted by it: the footage bends as it
// slides under the rim and its colour channels pull apart, hardest while the
// page is moving fast. Nothing else on the page is touched — the strips only
// draw where a video is under them, and the flat page colour fills whatever the
// bend pulls in from off the edge of a clip.

document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Desktop only: phones scroll too fast and loosely for the effect to read,
    // and they pay for the texture uploads either way.
    const small = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    if (small.matches) return;

    const videos = Array.from(document.querySelectorAll('.photo-item video.photo'));
    if (!videos.length) return;

    const BAND_RATIO = 0.13;   // strip depth as a share of the viewport height
    const BAND_MIN = 80;
    const BAND_MAX = 175;
    const WOBBLE = 1.2;        // headroom the quad leaves for the liquid edge
    const VEL_SCALE = 45;      // px of scroll per frame that counts as full speed
    const MAX_DPR = 2;
    const BG = [0xf5 / 255, 0xf5 / 255, 0xf5 / 255];   // matches body background

    const VERT = `
        attribute vec2 position;   // unit quad
        uniform vec4 uQuad;        // x, y, w, h in viewport px, y down
        uniform vec2 uRes;
        varying vec2 vPx;
        void main() {
            vPx = uQuad.xy + position * uQuad.zw;
            vec2 clip = vec2(vPx.x / uRes.x * 2.0 - 1.0, 1.0 - vPx.y / uRes.y * 2.0);
            gl_Position = vec4(clip, 0.0, 1.0);
        }
    `;

    const FRAG = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif

        varying vec2 vPx;

        uniform sampler2D uTex;
        uniform vec4 uRect;    // the video's box in viewport px: x, y, w, h
        uniform vec2 uRes;
        uniform float uBand;   // strip depth in px
        uniform float uEdgeY;  // viewport y of the glass rim
        uniform float uDir;    // +1 when the page runs below the rim, -1 above
        uniform float uTime;
        uniform float uVel;    // -1..1 scroll velocity
        uniform vec3 uBg;

        // The rim breathes along its length, so the pane reads as liquid rather
        // than as a ruled line across the window.
        float wobble(float x) {
            return 1.0
                + 0.09 * sin(x * 3.7 + uTime * 0.45)
                + 0.04 * sin(x * 8.3 - uTime * 0.75);
        }

        // Outside the clip there is only flat page colour, so fill with that
        // instead of smearing the video's own edge pixels.
        vec3 tap(vec2 uv) {
            vec3 c = texture2D(uTex, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
            float inside = step(0.0, uv.y) * step(uv.y, 1.0);
            return mix(uBg, c, inside);
        }

        void main() {
            float band = uBand * wobble(vPx.x / uRes.x);
            float t = clamp(abs(vPx.y - uEdgeY) / band, 0.0, 1.0);
            if (t >= 1.0) discard;

            // Quarter-cylinder glass: the slope runs away at the rim and
            // flattens to nothing where the strip ends, so light bends hardest
            // right at the edge and the inner boundary stays seamless.
            float u = 1.0 - t;
            float slope = u / sqrt(max(1.0 - u * u, 0.02));
            float bend = min(slope, 5.0) / 5.0;

            float speed = min(abs(uVel), 1.0);
            vec2 uv = (vPx - uRect.xy) / uRect.zw;

            // Refraction pulls the sample deeper into the page, and the three
            // channels take three different depths — that split is what widens
            // into visible chromatic divergence as the scroll speeds up.
            float push = bend * band * (0.55 + 0.40 * speed) * uDir / uRect.w;
            float spread = 0.12 + 0.65 * speed;
            vec2 n = vec2(0.0, push);

            vec3 col;
            col.r = tap(uv + n * (1.0 + spread)).r;
            col.g = tap(uv + n).g;
            col.b = tap(uv + n * (1.0 - spread)).b;

            // Rim light: a soft lift across the bend plus a travelling glint
            // hugging the very edge.
            float glint = 0.5 + 0.5 * sin(vPx.x / uRes.x * 5.0 - uTime * 0.6);
            col += pow(bend, 3.0) * 0.20 + pow(bend, 10.0) * 0.38 * glint;

            float a = 1.0 - smoothstep(0.55, 1.0, t);
            gl_FragColor = clamp(vec4(col * a, a), 0.0, 1.0);   // premultiplied
        }
    `;

    const canvas = document.createElement('canvas');
    canvas.id = 'page-glass';
    document.body.appendChild(canvas);

    const gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power'
    });
    if (!gl) {
        canvas.remove();
        return;
    }

    const compile = (type, src) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('glass shader:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
        canvas.remove();
        return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('glass program:', gl.getProgramInfoLog(program));
        canvas.remove();
        return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        gl.STATIC_DRAW
    );
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
        tex: gl.getUniformLocation(program, 'uTex'),
        quad: gl.getUniformLocation(program, 'uQuad'),
        rect: gl.getUniformLocation(program, 'uRect'),
        res: gl.getUniformLocation(program, 'uRes'),
        band: gl.getUniformLocation(program, 'uBand'),
        edgeY: gl.getUniformLocation(program, 'uEdgeY'),
        dir: gl.getUniformLocation(program, 'uDir'),
        time: gl.getUniformLocation(program, 'uTime'),
        vel: gl.getUniformLocation(program, 'uVel'),
        bg: gl.getUniformLocation(program, 'uBg')
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied source
    gl.clearColor(0, 0, 0, 0);
    gl.uniform1i(uniforms.tex, 0);
    gl.uniform3f(uniforms.bg, BG[0], BG[1], BG[2]);

    // One texture per clip, built the first time that clip reaches a strip.
    const slots = new Map();
    const slotFor = (video) => {
        let slot = slots.get(video);
        if (!slot) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            slot = { texture, allocated: false };
            slots.set(video, slot);
        }
        return slot;
    };

    // Upload at most once per clip per frame, however many strips it is under.
    const upload = (video, frame) => {
        const slot = slotFor(video);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, slot.texture);
        if (slot.frame === frame) return;
        if (slot.allocated) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            slot.allocated = true;
        }
        slot.frame = frame;
    };

    let dpr = 0;
    let vw = 0;
    let vh = 0;
    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        vw = window.innerWidth;
        vh = window.innerHeight;
        const w = Math.max(1, Math.round(vw * dpr));
        const h = Math.max(1, Math.round(vh * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
        gl.uniform2f(uniforms.res, vw, vh);
    };
    resize();
    window.addEventListener('resize', resize);

    let lost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
        // Textures and program are gone with the context; a reload is the only
        // honest recovery, so leave the strips off rather than draw garbage.
        canvas.remove();
    });

    let lastScroll = window.scrollY;
    let velocity = 0;
    let painted = false;
    let frameId = 0;
    const start = performance.now();

    const frame = () => {
        requestAnimationFrame(frame);
        if (document.hidden || lost) return;

        if (small.matches) {
            // A desktop window dragged down to the mobile layout idles the same
            // way it would on a phone.
            if (painted) {
                gl.clear(gl.COLOR_BUFFER_BIT);
                painted = false;
            }
            return;
        }

        if (vw !== window.innerWidth || vh !== window.innerHeight) resize();

        const y = window.scrollY;
        const raw = Math.max(-1, Math.min(1, (y - lastScroll) / VEL_SCALE));
        lastScroll = y;
        velocity += (raw - velocity) * 0.2;   // smoothed, so the split eases out

        const band = Math.min(BAND_MAX, Math.max(BAND_MIN, vh * BAND_RATIO));
        const reach = band * WOBBLE;
        const time = (performance.now() - start) / 1000;

        gl.clear(gl.COLOR_BUFFER_BIT);
        painted = false;
        frameId++;

        gl.uniform1f(uniforms.band, band);
        gl.uniform1f(uniforms.time, time);
        gl.uniform1f(uniforms.vel, velocity);

        // Each strip redraws whatever slice of a clip is under it.
        const strips = [
            { edgeY: 0, dir: 1, top: 0, bottom: reach },
            { edgeY: vh, dir: -1, top: vh - reach, bottom: vh }
        ];

        videos.forEach(video => {
            const rect = video.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            if (rect.bottom <= 0 || rect.top >= vh) return;
            if (video.readyState < 2 || !video.videoWidth) return;   // no frame yet

            strips.forEach(strip => {
                const top = Math.max(rect.top, strip.top);
                const bottom = Math.min(rect.bottom, strip.bottom);
                if (bottom - top < 0.5) return;

                upload(video, frameId);
                gl.uniform4f(uniforms.rect, rect.left, rect.top, rect.width, rect.height);
                gl.uniform4f(uniforms.quad, rect.left, top, rect.width, bottom - top);
                gl.uniform1f(uniforms.edgeY, strip.edgeY);
                gl.uniform1f(uniforms.dir, strip.dir);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                painted = true;
            });
        });
    };

    requestAnimationFrame(frame);
});
