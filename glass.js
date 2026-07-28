// Clips diverge as they reach the top and bottom ends of the page. Near an end
// the footage spreads sideways past its own box and stretches on out of frame,
// hardest at the very edge and easing to nothing a little way in, so there is
// no boundary to see — the clip just bows open as it leaves.
//
// The lens is the reference shader's: magnify by a field, sample soft, lift the
// light a touch. What is gone is its rounded-box mask — that made the glass a
// distinct object with a rim, and here the distortion has to fade out instead.
// The three channels diverge at slightly different widths, so the ends fringe,
// and the whole thing opens up with scroll speed.

document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Desktop only: phones scroll too fast and loosely for the effect to read,
    // and they pay for the texture uploads either way.
    const small = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    if (small.matches) return;

    const videos = Array.from(document.querySelectorAll('.photo-item video.photo'));
    if (!videos.length) return;

    const REACH_RATIO = 0.15;   // how far in from an end the divergence reaches
    const REACH_MIN = 110;
    const REACH_MAX = 240;
    const SPREAD = 0.14;        // widest the clip splays at the very end
    const SEPARATION = 0.16;    // how much further red splays than blue
    const STRETCH = 0.13;       // lengthwise pull, as a share of the reach
    const STRETCH_MAX = 20;     // px — kept under the gallery gap so clips
                                // cannot climb into each other
    const LIFT = 0.06;          // the reference's light, much reduced
    const FROST_PX = 1.5;       // tap spacing for the soft sampling, in css px
    const VEL_SCALE = 45;       // px of scroll per frame that counts as full speed
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
        uniform vec4 uRect;      // the clip's box in viewport px: x, y, w, h
        uniform vec2 uEnd;       // viewport y of the end, and how far it reaches
        uniform float uDir;      // +1 when the page interior is below the end
        uniform float uStretch;  // lengthwise pull at the very end, in px
        uniform vec2 uSpread;    // sideways splay, and the red/blue difference
        uniform vec2 uTexel;     // soft-sampling tap spacing, in uv
        uniform float uVel;      // -1..1 scroll velocity
        uniform vec3 uBg;

        const float SAMPLE_RANGE = 1.0;
        const float LIFT = ${LIFT.toFixed(3)};

        // Past the end of a clip there is only flat page colour, so fill with
        // that rather than smearing the clip's own edge pixels — it is what
        // makes the splayed channels fringe against the page instead of streak.
        vec3 tap(vec2 uv) {
            return mix(uBg, texture2D(iChannel0, clamp(uv, vec2(0.0), vec2(1.0))).rgb,
                       step(0.0, uv.x) * step(uv.x, 1.0) *
                       step(0.0, uv.y) * step(uv.y, 1.0));
        }

        // Softens with the divergence and collapses to a straight read where it
        // ends, so the sampling itself never marks the boundary.
        vec3 frost(vec2 uv, float spacing) {
            vec3 total = vec3(0.0);
            for (float x = -SAMPLE_RANGE; x <= SAMPLE_RANGE; x++) {
                for (float y = -SAMPLE_RANGE; y <= SAMPLE_RANGE; y++) {
                    total += tap(uv + vec2(x, y) * uTexel * spacing);
                }
            }
            return total / 9.0;
        }

        void main() {
            // 1 hard against the end, easing to nothing at the reach. Squared,
            // so it lands flat and leaves no seam where it runs out.
            float t = clamp(abs(vPx.y - uEnd.x) / uEnd.y, 0.0, 1.0);
            float s = (1.0 - t) * (1.0 - t);
            if (s <= 0.0) discard;

            float speed = min(abs(uVel), 1.0);
            float sep = uSpread.y * (0.35 + 0.65 * speed);
            float splay = uSpread.x * s;

            // Sampling from further inside as the end approaches is what pulls
            // the picture out past where the clip really stops.
            float v = (vPx.y + uDir * uStretch * s - uRect.y) / uRect.w;
            float dx = vPx.x - (uRect.x + uRect.z * 0.5);

            // Three widths: red opens widest, blue narrowest, so the ends part
            // into colour the further they diverge.
            float ur = 0.5 + dx / (uRect.z * (1.0 + splay * (1.0 + sep)));
            float ug = 0.5 + dx / (uRect.z * (1.0 + splay));
            float ub = 0.5 + dx / (uRect.z * (1.0 + splay * (1.0 - sep)));

            vec3 col = vec3(
                frost(vec2(ur, v), s).r,
                frost(vec2(ug, v), s).g,
                frost(vec2(ub, v), s).b
            );
            col += LIFT * s * s;   // the reference's lighting, held right down

            // Opaque wherever the clip is actually displaced, so the untouched
            // video underneath is covered; transparent where it is not, and
            // feathered by a pixel where the splayed picture runs out.
            float feather = smoothstep(0.0, uTexel.x, ug) * smoothstep(0.0, uTexel.x, 1.0 - ug)
                          * smoothstep(0.0, uTexel.y, v) * smoothstep(0.0, uTexel.y, 1.0 - v);
            float a = smoothstep(0.0, 0.03, s) * feather;

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
        end: gl.getUniformLocation(program, 'uEnd'),
        dir: gl.getUniformLocation(program, 'uDir'),
        stretch: gl.getUniformLocation(program, 'uStretch'),
        spread: gl.getUniformLocation(program, 'uSpread'),
        texel: gl.getUniformLocation(program, 'uTexel'),
        vel: gl.getUniformLocation(program, 'uVel'),
        bg: gl.getUniformLocation(program, 'uBg')
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied source
    gl.clearColor(0, 0, 0, 0);
    gl.uniform1i(uniforms.texture, 0);
    gl.uniform3f(uniforms.bg, BG[0], BG[1], BG[2]);
    gl.uniform2f(uniforms.spread, SPREAD, SEPARATION);

    // One texture per clip, built the first time that clip reaches an end.
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

    // Upload at most once per clip per frame, however many ends it reaches.
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
        // honest recovery, so drop the effect rather than draw garbage.
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
        velocity += (raw - velocity) * 0.2;   // smoothed, so the splay eases out

        const reach = Math.min(REACH_MAX, Math.max(REACH_MIN, vh * REACH_RATIO));
        const stretch = Math.min(STRETCH_MAX, reach * STRETCH);
        const widest = SPREAD * (1 + SEPARATION);

        gl.clear(gl.COLOR_BUFFER_BIT);
        painted = false;
        frameId++;
        gl.uniform1f(uniforms.vel, velocity);
        gl.uniform1f(uniforms.stretch, stretch);

        const ends = [
            { y: 0, dir: 1, top: 0, bottom: reach },
            { y: vh, dir: -1, top: vh - reach, bottom: vh }
        ];

        videos.forEach(video => {
            const rect = video.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            if (rect.bottom <= 0 || rect.top >= vh) return;
            if (video.readyState < 2 || !video.videoWidth) return;   // no frame yet

            // The quad has to hold the picture after it splays, so it runs wider
            // than the clip and a little past both of its ends.
            const grow = rect.width * widest * 0.5;
            const left = rect.left - grow;
            const width = rect.width + grow * 2;

            ends.forEach(end => {
                const top = Math.max(rect.top - stretch, end.top);
                const bottom = Math.min(rect.bottom + stretch, end.bottom);
                if (bottom - top < 0.5) return;

                upload(video, frameId);
                gl.uniform4f(uniforms.rect, rect.left, rect.top, rect.width, rect.height);
                gl.uniform4f(uniforms.quad, left, top, width, bottom - top);
                gl.uniform2f(uniforms.end, end.y, reach);
                gl.uniform1f(uniforms.dir, end.dir);
                gl.uniform2f(uniforms.texel, FROST_PX / rect.width, FROST_PX / rect.height);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                painted = true;
            });
        });
    };

    render();
});
