// Two ways to read a caption. On desktop, hovering a video swaps the bio out
// for a grey box holding that video's caption, in the same place, and leaving
// puts the bio back. Touch devices have no hover, so there a tap lays the
// caption over the video for six seconds and tapping again dismisses it early.
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.photo-item');
    if (!items.length) return;

    if (window.matchMedia('(hover: hover)').matches) {
        const container = document.querySelector('.container');
        const box = document.querySelector('.caption-box');
        if (!container || !box) return;

        items.forEach(item => {
            const caption = item.querySelector('.photo-caption');
            if (!caption) return;

            const line = caption.textContent.trim();
            item.addEventListener('mouseenter', () => {
                box.textContent = line;
                container.classList.add('is-captioning');
            });
            item.addEventListener('mouseleave', () => {
                container.classList.remove('is-captioning');
            });
        });
        return;
    }

    const HOLD_MS = 6000;
    let timer;

    const clear = () => {
        clearTimeout(timer);
        items.forEach(item => item.classList.remove('is-active'));
    };

    items.forEach(item => {
        item.addEventListener('click', () => {
            const wasActive = item.classList.contains('is-active');
            clear();
            if (wasActive) return;

            item.classList.add('is-active');
            timer = setTimeout(clear, HOLD_MS);
        });
    });
});
