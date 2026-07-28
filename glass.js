// A bar of liquid glass lying along the top and bottom of the viewport. Videos
// scrolling through them are refracted by the same shader you'd get from the
// reference lens — rounded-box mask, lens magnification, frosted sampling, and
// the rb1/rb2/rb3 rim lighting — with the 2D rounded box collapsed into a
// horizontal slab, so the bar's two faces play the part of the lens edge.
//
// On top of the reference: the clip swells sideways and its channels take
// different lens depths as it passes through, so it separates like anaglyph.
// That spread opens up with scroll speed and closes when the page settles.
//
// The bars only paint where a clip is under them; the rest of the page, and
// whatever the lens drags in from past the end of a clip, stays page colour.

document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Desktop only: phones scroll too fast and loosely for the effect to read,
    // and they pay for the texture uploads either way.
    const small = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    if (small.matches) return;

    const videos = Array.from(document.querySelectorAll('.photo-item video.photo'));
    if (!videos.length) return;

    const BAND_RATIO = 0.13;   // bar depth as a share of the viewport height
    const BAND_MIN = 80;
    const BAND_MAX = 175;
    const FROST_PX = 1.5;      // tap spacing for the frosted sampling, in css px
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
        precision mediump float;

        varying vec2 vPx;

        uniform sampler2D iChannel0;
        uniform vec4 uRect;    // the clip's box in viewport px: x, y, w, h
        uniform vec2 uSlab;    // the bar: midline y, half depth — in viewport px
        uniform vec2 uTexel;   // frost tap spacing, in uv
        uniform float uVel;    // -1..1 scroll velocity
        uniform vec3 uBg;

        const float POWER_EXPONENT = 6.0;
        const float MASK_MULTIPLIER_1 = 1.0;
        const float MASK_MULTIPLIER_2 = 0.95;
        const float MASK_MULTIPLIER_3 = 1.1;
        const float MASK_STRENGTH_1 = 8.0;
        const float MASK_STRENGTH_2 = 16.0;
        const float MASK_STRENGTH_3 = 2.0;
        const float MASK_THRESHOLD_1 = 0.95;
        const float MASK_THRESHOLD_2 = 0.9;
        const float MASK_THRESHOLD_3 = 1.5;
        const float LENS_DEPTH = 0.5;
        const float SAMPLE_RANGE = 1.0;
        const float LIGHTING_INTENSITY = 0.3;
        const float SWELL = 0.05;         // how far the clip spreads sideways
        const float SEPARATION = 0.008;   // anaglyph split, in uv
        const float SLAB_HALF_UV = 0.215; // the reference blob's half height

        // Past the end of a clip there is only flat page colour, so fill with
        // that instead of smearing the clip's own edge pixels.
        vec3 tap(vec2 uv) {
            vec3 c = texture2D(iChannel0, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
            float inside = step(0.0, uv.x) * step(uv.x, 1.0)
                         * step(0.0, uv.y) * step(uv.y, 1.0);
            return mix(uBg, c, inside);
        }

        // The reference frosts with a 9x9 box; these bars cover far more of the
        // screen than its lens did, and each channel needs its own pass, so the
        // kernel is thinned to 3x3 and the taps spaced wider to compensate.
        vec3 frost(vec2 uv) {
            vec3 total = vec3(0.0);
            for (float x = -SAMPLE_RANGE; x <= SAMPLE_RANGE; x++) {
                for (float y = -SAMPLE_RANGE; y <= SAMPLE_RANGE; y++) {
                    total += tap(uv + vec2(x, y) * uTexel);
                }
            }
            return total / 9.0;
        }

        void main() {
            // The slab standing in for the reference's rounded box: flat through
            // the middle of the bar, rising steeply at either face.
            float q = (vPx.y - uSlab.x) / uSlab.y;   // -1..1 across the bar
            float roundedBox = pow(abs(q), POWER_EXPONENT);

            float rb1 = clamp((1.0 - roundedBox * MASK_MULTIPLIER_1) * MASK_STRENGTH_1, 0.0, 1.0);
            float rb2 = clamp((MASK_THRESHOLD_1 - roundedBox * MASK_MULTIPLIER_2) * MASK_STRENGTH_2, 0.0, 1.0) -
                clamp((MASK_THRESHOLD_2 - roundedBox * MASK_MULTIPLIER_2) * MASK_STRENGTH_2, 0.0, 1.0);
            float rb3 = clamp((MASK_THRESHOLD_3 - roundedBox * MASK_MULTIPLIER_3) * MASK_STRENGTH_3, 0.0, 1.0) -
                clamp((1.0 - roundedBox * MASK_MULTIPLIER_3) * MASK_STRENGTH_3, 0.0, 1.0);

            float transition = smoothstep(0.0, 1.0, rb1 + rb2);
            if (transition <= 0.0) discard;

            vec2 uv = (vPx - uRect.xy) / uRect.zw;
            float mid = (uSlab.x - uRect.y) / uRect.w;   // the bar's midline, in uv
            float speed = min(abs(uVel), 1.0);
            float spread = 0.12 + 0.88 * speed;

            // The bar squeezes what sits under its faces back toward its midline
            // and lets the middle through straight — the reference's lens, on one
            // axis.
            float depth = roundedBox * LENS_DEPTH;

            // The 3D spread runs across the whole bar rather than only its rim,
            // so a clip swells and its channels part company the entire time it
            // is passing through. At rest it closes back up to almost nothing.
            float pass = rb1 * (0.45 + 0.55 * roundedBox) * spread;
            float swell = 1.0 + pass * SWELL;
            float sep = pass * SEPARATION;
            float ux = 0.5 + (uv.x - 0.5) * swell;

            vec2 lensR = vec2(ux + sep, mid + (uv.y - mid) * (1.0 - depth * (1.0 + spread)));
            vec2 lensG = vec2(ux, mid + (uv.y - mid) * (1.0 - depth));
            vec2 lensB = vec2(ux - sep, mid + (uv.y - mid) * (1.0 - depth * (1.0 - spread)));

            vec4 fragColor = vec4(frost(lensR).r, frost(lensG).g, frost(lensB).b, 1.0);

            // Lighting, as in the reference: a soft gradient down the body plus
            // the bright ring hugging each face. The reference works in screen-up
            // coordinates, so the slab position flips sign on the way in.
            float m2y = -q * SLAB_HALF_UV;
            float gradient = clamp((clamp(m2y, 0.0, 0.2) + 0.1) / 2.0, 0.0, 1.0) +
                clamp((clamp(-m2y, -1000.0, 0.2) * rb3 + 0.1) / 2.0, 0.0, 1.0);
            vec4 lighting = clamp(fragColor + vec4(rb1) * gradient + vec4(rb2) * LIGHTING_INTENSITY, 0.0, 1.0);

            // The reference mixes back to the untouched image; here the untouched
            // image is the real video underneath, so fade out in alpha instead.
            gl_FragColor = vec4(lighting.rgb * transition, transition);   // premultiplied
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

    const createShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VERT);
    const fs = createShader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
        canvas.remove();
        return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program error:', gl.getProgramInfoLog(program));
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
        texture: gl.getUniformLocation(program, 'iChannel0'),
        quad: gl.getUniformLocation(program, 'uQuad'),
        rect: gl.getUniformLocation(program, 'uRect'),
        resolution: gl.getUniformLocation(program, 'uRes'),
        slab: gl.getUniformLocation(program, 'uSlab'),
        texel: gl.getUniformLocation(program, 'uTexel'),
        vel: gl.getUniformLocation(program, 'uVel'),
        bg: gl.getUniformLocation(program, 'uBg')
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied source
    gl.clearColor(0, 0, 0, 0);
    gl.uniform1i(uniforms.texture, 0);
    gl.uniform3f(uniforms.bg, BG[0], BG[1], BG[2]);

    // One texture per clip, built the first time that clip reaches a bar.
    const slots = new Map();
    const setupTexture = (video) => {
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

    // Upload at most once per clip per frame, however many bars it is under.
    const upload = (video, frameId) => {
        const slot = setupTexture(video);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, slot.texture);
        if (slot.frame === frameId) return;
        if (slot.allocated) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            slot.allocated = true;
        }
        slot.frame = frameId;
    };

    let vw = 0;
    let vh = 0;
    const setCanvasSize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        vw = window.innerWidth;
        vh = window.innerHeight;
        const w = Math.max(1, Math.round(vw * dpr));
        const h = Math.max(1, Math.round(vh * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
        gl.uniform2f(uniforms.resolution, vw, vh);
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    let lost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
        // Program and textures went with the context; a reload is the only
        // honest recovery, so drop the bars rather than draw garbage.
        canvas.remove();
    });

    let lastScroll = window.scrollY;
    let velocity = 0;
    let painted = false;
    let frameId = 0;

    const render = () => {
        requestAnimationFrame(render);
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

        if (vw !== window.innerWidth || vh !== window.innerHeight) setCanvasSize();

        const y = window.scrollY;
        const raw = Math.max(-1, Math.min(1, (y - lastScroll) / VEL_SCALE));
        lastScroll = y;
        velocity += (raw - velocity) * 0.2;   // smoothed, so the split eases out

        const band = Math.min(BAND_MAX, Math.max(BAND_MIN, vh * BAND_RATIO));
        const half = band / 2;

        gl.clear(gl.COLOR_BUFFER_BIT);
        painted = false;
        frameId++;
        gl.uniform1f(uniforms.vel, velocity);

        // Each bar redraws whatever slice of a clip is lying under it.
        const bars = [
            { mid: half, top: 0, bottom: band },
            { mid: vh - half, top: vh - band, bottom: vh }
        ];

        videos.forEach(video => {
            const rect = video.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            if (rect.bottom <= 0 || rect.top >= vh) return;
            if (video.readyState < 2 || !video.videoWidth) return;   // no frame yet

            bars.forEach(bar => {
                const top = Math.max(rect.top, bar.top);
                const bottom = Math.min(rect.bottom, bar.bottom);
                if (bottom - top < 0.5) return;

                upload(video, frameId);
                gl.uniform4f(uniforms.rect, rect.left, rect.top, rect.width, rect.height);
                gl.uniform4f(uniforms.quad, rect.left, top, rect.width, bottom - top);
                gl.uniform2f(uniforms.slab, bar.mid, half);
                gl.uniform2f(uniforms.texel, FROST_PX / rect.width, FROST_PX / rect.height);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                painted = true;
            });
        });
    };

    render();
});
