// Resolve through the live household roster, never a copied historical name.
export function itemActorName(actorUID, members, currentUID, status = 'ready') {
  if (!actorUID) return 'Uppgift saknas';
  if (actorUID === currentUID) return 'Du';
  if (status === 'loading') return 'Hämtar namn…';
  if (status !== 'ready') return 'Namnet kunde inte hämtas';
  const member = members.find(member => member.id === actorUID);
  if (!member) return 'Tidigare medlem';
  return member.displayName?.trim() || 'Medlem utan namn';
}
