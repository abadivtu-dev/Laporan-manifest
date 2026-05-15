import { logger } from '../utils/logger.js';

export async function findGroup(sock, groupJid, groupName) {
  const groups = await sock.groupFetchAllParticipating();
  const groupList = Object.values(groups);

  // Strategy 1: Direct JID match
  if (groupJid && groups[groupJid]) {
    logger.info('[wa] found group by JID', { jid: groupJid, name: groups[groupJid].subject });
    return groups[groupJid];
  }

  // Strategy 2: Exact name match
  if (groupName) {
    const exactMatch = groupList.find((g) => g.subject === groupName);
    if (exactMatch) {
      logger.info('[wa] found group by exact name', { name: groupName });
      return exactMatch;
    }

    // Strategy 3: Case-insensitive contains match
    const lowerName = groupName.toLowerCase();
    const containsMatch = groupList.find((g) => g.subject.toLowerCase().includes(lowerName));
    if (containsMatch) {
      logger.info('[wa] found group by partial name', { name: groupName, matched: containsMatch.subject });
      return containsMatch;
    }
  }

  // No match found - list available groups
  const availableGroups = groupList.map((g) => `"${g.subject}" (${g.id})`).join(', ');
  const message = `GROUP_NOT_FOUND: No group matching "${groupJid || groupName}". Available groups: ${availableGroups}`;
  logger.error('[wa] group not found', { groupJid, groupName });
  throw new Error(message);
}
