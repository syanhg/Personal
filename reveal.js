document.addEventListener('DOMContentLoaded', () => {
    const photos = document.querySelectorAll('.photo');
    if (!photos.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
        photos.forEach(p => p.classList.add('is-visible'));
        return;
    }

    let firstPass = true;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry, i) => {
            if (!entry.isIntersecting) return;
            // Stagger only the images already on screen at load.
            if (firstPass) entry.target.style.transitionDelay = `${i * 90}ms`;
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
        });
        firstPass = false;
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

    photos.forEach(p => observer.observe(p));
});
