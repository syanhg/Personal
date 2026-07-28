// Hovering a video swaps the bio out for a grey box holding that video's
// caption, in the same place; leaving puts the bio back. Touch devices have no
// hover, so there the figcaptions read in place under each video and this does
// nothing.
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.container');
    const box = document.querySelector('.caption-box');
    if (!container || !box) return;
    if (!window.matchMedia('(hover: hover)').matches) return;

    document.querySelectorAll('.photo-item').forEach(item => {
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
});
