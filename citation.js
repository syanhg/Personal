(() => {
    const citation = document.querySelector('.citation');
    const button = citation.querySelector('.citation-toggle');
    const note = citation.querySelector('.citation-note');

    const setOpen = open => {
        note.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
    };

    button.addEventListener('click', () => setOpen(note.hidden));
    document.addEventListener('click', event => {
        if (!citation.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !note.hidden) {
            setOpen(false);
            button.focus();
        }
    });
})();
