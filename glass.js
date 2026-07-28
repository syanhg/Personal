// Liquid glass at the ends of each gallery video. A transparent WebGL canvas
// sits over the video and re-draws only a band along its top and bottom edge,
// refracting the video's own pixels there. The band lights up as that edge
// closes on the matching edge of the viewport, so footage looks like it bends
// under glass on the way in and out of view. Scroll speed pulls the colour
// channels apart, which is what reads as divergence.

document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Desktop only: phones and tablets pay for the extra contexts and texture
    // uploads without the deliberate scrolling the effect is built around.
    const small = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    if (small.matches) return;

    const videos = document.querySelectorAll('.photo-item video.photo');
    if (!videos.length) return;

    const BAND_RATIO = 0.14;   // band depth as a share of the video height
    const BAND_MIN = 44;
    const BAND_MAX = 170;
    const REACH = 0.55;        // how far from the viewport edge a rim wakes up
    const VEL_SCALE = 45;      // px of scroll per frame that counts as full speed
    const MAX_DPR = 2;

    const VERT = `
        attribute vec2 position;
        varying vec2 vUv;
        void main() {
            vUv = position * 0.5 + 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    const FRAG = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif

        varying vec2 vUv;

        uniform sampler2D uTex;
        uniform vec2 uSize;    // element size in css px
        uniform float uBand;   // band depth in css px
        uniform float uTop;    // 0..1, how lit the top rim is
        uniform float uBottom;
        uniform float uTime;
        uniform float uVel;    // -1..1 scroll velocity

        // The band breathes along its length so the glass reads as liquid
        // rather than as a straight bevel.
        float wobble(float phase) {
            return 1.0
                + 0.10 * sin(vUv.x * 4.0 + phase)
                + 0.05 * sin(vUv.x * 9.0 - phase * 1.7);
        }

        // One rim. dist is the distance in px from the edge, dir points from
        // that edge into the video, s is how lit the rim is.
        vec4 rim(float dist, float dir, float s, float band) {
            if (s <= 0.0) return vec4(0.0);
            float t = clamp(dist / band, 0.0, 1.0);
            if (t >= 1.0) return vec4(0.0);

            // Quarter-cylinder profile: the slope runs away at the rim and
            // flattens to nothing where the band ends, so light bends hardest
            // at the very edge and the inner boundary stays seamless.
            float u = 1.0 - t;
            float slope = u / sqrt(max(1.0 - u * u, 0.02));
            float bend = min(slope, 5.0) / 5.0;

            float push = bend * band * 0.75 * s / uSize.y;   // uv units
            float spread = 0.10 + 0.45 * min(abs(uVel), 1.0);
            vec2 n = vec2(0.0, dir);
            vec2 base = clamp(vUv + n * push, vec2(0.0), vec2(1.0));

            vec3 col;
            col.r = texture2D(uTex, clamp(base + n * push * spread, vec2(0.0), vec2(1.0))).r;
            col.g = texture2D(uTex, base).g;
            col.b = texture2D(uTex, clamp(base - n * push * spread, vec2(0.0), vec2(1.0))).b;

            // Rim light: a soft lift over the whole bend plus a travelling glint
            // hugging the edge.
            float glint = 0.5 + 0.5 * sin(vUv.x * 5.0 - uTime * 0.6);
            col += (pow(bend, 3.0) * 0.28 + pow(bend, 8.0) * 0.35 * glint) * s;

            // GLSL leaves smoothstep undefined when edge0 > edge1, so invert.
            float a = s * (1.0 - smoothstep(0.5, 1.0, t));
            return vec4(col * a, a);   // premultiplied
        }

        void main() {
            float py = vUv.y * uSize.y;
            vec4 top = rim(uSize.y - py, -1.0, uTop, uBand * wobble(uTime * 0.45));
            vec4 bot = rim(py, 1.0, uBottom, uBand * wobble(uTime * 0.45 + 2.1));
            gl_FragColor = clamp(top + bot, 0.0, 1.0);   // the bands never overlap
        }
    `;

    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    const ease = v => v * v * (3 - 2 * v);

    const createGlass = (video) => {
        const canvas = document.createElement('canvas');
        canvas.className = 'photo-glass';
        video.insertAdjacentElement('afterend', canvas);

        let gl = null;
        let uniforms = null;
        let texture = null;
        let dead = false;
        let lost = false;
        let allocated = false;
        let lit = false;

        // Keep the context recoverable and sit the effect out until the driver
        // hands it back, then rebuild from scratch on the next lit frame.
        canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            lost = true;
            lit = false;
        });

        canvas.addEventListener('webglcontextrestored', () => {
            gl = null;
            allocated = false;
            lost = false;
        });

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

        const giveUp = () => {
            dead = true;
            gl = null;
            canvas.remove();
            return false;
        };

        // The context is built the first time a rim actually lights, so the page
        // never pays for videos it has not scrolled to.
        const init = () => {
            gl = canvas.getContext('webgl', {
                alpha: true,
                premultipliedAlpha: true,
                antialias: false,
                depth: false,
                stencil: false,
                powerPreference: 'low-power'
            });
            if (!gl) return giveUp();

            const vs = compile(gl.VERTEX_SHADER, VERT);
            const fs = compile(gl.FRAGMENT_SHADER, FRAG);
            if (!vs || !fs) return giveUp();

            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('glass program:', gl.getProgramInfoLog(program));
                return giveUp();
            }
            gl.useProgram(program);

            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
                gl.STATIC_DRAW
            );
            const position = gl.getAttribLocation(program, 'position');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

            uniforms = {
                tex: gl.getUniformLocation(program, 'uTex'),
                size: gl.getUniformLocation(program, 'uSize'),
                band: gl.getUniformLocation(program, 'uBand'),
                top: gl.getUniformLocation(program, 'uTop'),
                bottom: gl.getUniformLocation(program, 'uBottom'),
                time: gl.getUniformLocation(program, 'uTime'),
                vel: gl.getUniformLocation(program, 'uVel')
            };

            texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied source
            gl.clearColor(0, 0, 0, 0);
            return true;
        };

        const clear = () => {
            if (!lit || !gl) return;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            lit = false;
        };

        const draw = (rect, top, bottom, time, velocity) => {
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }

            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            if (allocated) {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                allocated = true;
            }
            gl.uniform1i(uniforms.tex, 0);

            const band = Math.min(BAND_MAX, Math.max(BAND_MIN, rect.height * BAND_RATIO));
            gl.uniform2f(uniforms.size, rect.width, rect.height);
            gl.uniform1f(uniforms.band, band);
            gl.uniform1f(uniforms.top, top);
            gl.uniform1f(uniforms.bottom, bottom);
            gl.uniform1f(uniforms.time, time);
            gl.uniform1f(uniforms.vel, velocity);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            lit = true;
        };

        return (vh, reach, time, velocity, enabled) => {
            if (dead || lost) return;
            if (!enabled) {
                clear();
                return;
            }

            const rect = video.getBoundingClientRect();
            const offscreen = rect.bottom <= 0 || rect.top >= vh || rect.width < 1;
            let top = 0;
            let bottom = 0;
            if (!offscreen) {
                // Each rim peaks when it meets the viewport edge it belongs to.
                top = ease(1 - clamp01(Math.abs(rect.top) / reach));
                bottom = ease(1 - clamp01(Math.abs(vh - rect.bottom) / reach));
            }

            if (top <= 0.001 && bottom <= 0.001) {
                clear();
                return;
            }
            // HAVE_CURRENT_DATA — anything less has no frame to sample.
            if (video.readyState < 2 || !video.videoWidth) {
                clear();
                return;
            }
            if (!gl && !init()) return;

            draw(rect, top, bottom, time, velocity);
        };
    };

    const glasses = [];
    videos.forEach(video => glasses.push(createGlass(video)));

    let lastScroll = window.scrollY;
    let velocity = 0;
    const start = performance.now();

    const frame = () => {
        requestAnimationFrame(frame);
        if (document.hidden) return;

        const y = window.scrollY;
        const raw = Math.max(-1, Math.min(1, (y - lastScroll) / VEL_SCALE));
        lastScroll = y;
        velocity += (raw - velocity) * 0.2;   // smoothed, so the split eases out

        const time = (performance.now() - start) / 1000;
        const vh = window.innerHeight;
        const reach = vh * REACH;
        // A desktop window dragged down to the mobile layout idles the same way.
        const enabled = !small.matches;
        glasses.forEach(update => update(vh, reach, time, velocity, enabled));
    };

    requestAnimationFrame(frame);
});
