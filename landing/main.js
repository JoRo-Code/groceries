// Local illustration only: this example never reads or writes shopping data.
for (const item of document.querySelectorAll('.demo-item')) {
  item.addEventListener('click', () => {
    const checked = item.getAttribute('aria-pressed') !== 'true';
    item.setAttribute('aria-pressed', String(checked));
    item.classList.toggle('is-checked', checked);
  });
}
