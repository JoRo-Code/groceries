'use strict';
const validPath = /^\/join\/[a-f0-9-]{72}$/.test(window.location.pathname);
if (!validPath) {
  document.querySelector('#intro').textContent = 'Den här adressen innehåller ingen giltig inbjudan. Be den som bjuder in dig att skicka länken igen.';
  document.querySelector('#instructions').hidden = true;
} else {
  document.querySelector('#copy').addEventListener('click', async () => {
    try {
      // Only the recognized invitation path is copied; query parameters are not needed.
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
      document.querySelector('#status').textContent = 'Länken är kopierad. Klistra in den i Handla.';
    } catch {
      document.querySelector('#status').textContent = 'Kopiera länken från adressfältet och klistra in den i Handla.';
    }
  });
}
