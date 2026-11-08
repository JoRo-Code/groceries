const APP_ORIGINS = new Set([
  'https://app.palisty.com',
  'https://groceries-ros.web.app',
  'https://groceries-ros.firebaseapp.com',
]);
const TOKEN = /^[a-f0-9-]{72}$/;

// Old invitations remain usable when a household moves to the new app domain.
export function invitationToken(input, currentOrigin) {
  const url = new URL(input, currentOrigin);
  const token = url.pathname.match(/^\/join\/([^/]+)\/?$/)?.[1];
  if ((!APP_ORIGINS.has(url.origin) && url.origin !== currentOrigin) ||
      url.username || url.password || !TOKEN.test(token ?? '')) {
    throw new Error('Inbjudningslänken är inte giltig.');
  }
  return token;
}

export function invitationOrigin(projectID, currentOrigin) {
  return APP_ORIGINS.has(currentOrigin) ? currentOrigin : `https://${projectID}.web.app`;
}
