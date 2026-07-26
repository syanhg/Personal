// Captions reveal on hover via CSS. Touch devices have no hover, so a tap
// shows one for 6 seconds instead — tapping again dismisses it early.
document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(hover: hover)').matches) return;

    const items = document.querySelectorAll('.photo-item');
    if (!items.length) return;

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
