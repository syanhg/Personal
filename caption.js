// Two ways to read a caption. On desktop, hovering a video writes its line into
// the box under the profile and leaving restores the placeholder. On touch there
// is no hover, so a tap lays the caption over the video for six seconds instead
// and tapping again dismisses it early.
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.photo-item');
    if (!items.length) return;

    if (window.matchMedia('(hover: hover)').matches) {
        const box = document.querySelector('.caption-box');
        if (!box) return;

        const placeholder = box.textContent.trim();

        items.forEach(item => {
            const caption = item.querySelector('.photo-caption');
            if (!caption) return;

            const line = caption.textContent.trim();
            item.addEventListener('mouseenter', () => {
                box.textContent = line;
                box.classList.remove('is-placeholder');
            });
            item.addEventListener('mouseleave', () => {
                box.textContent = placeholder;
                box.classList.add('is-placeholder');
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
