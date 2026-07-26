document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-btn, .h1-link').forEach(a => {
        a.addEventListener('click', e => {
            const href = a.href;
            if (!href || a.origin !== location.origin) return;
            e.preventDefault();
            const container = document.querySelector('.layout') || document.querySelector('.container');
            container.style.transition = 'opacity 0.2s ease';
            container.style.opacity = '0';
            setTimeout(() => { window.location.href = href; }, 200);
        });
    });
});
