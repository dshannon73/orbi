/** Convert a glob-style pattern like *AMER*PACE* to a SOQL LIKE string with % wildcards */
function globToSoqlLike(pattern: string): string {
  return pattern.split('*').map(s => s.replace(/'/g, "''")).join('%');
}

/**
 * Convert a comma-separated pattern string to a SOQL clause for a given field.
 * Each part: converts * → %, escapes single quotes.
 * If a part has no % after conversion, wraps as %value% (substring match).
 * Prefix a part with ! to negate: !Closed → field NOT LIKE '%Closed%'
 * Multiple parts: (clause OR clause)  — or for negations AND NOT
 * For picklist exact matches (no globs): use = / != instead of LIKE
 */
export function patternToSoqlClause(pattern: string, field: string): string {
  const parts = pattern.split(',').map(p => p.trim()).filter(Boolean);
  const positive: string[] = [];
  const negative: string[] = [];

  for (const part of parts) {
    const negated = part.startsWith('!') || part.startsWith('-');
    const raw = negated ? part.slice(1).trim() : part;
    let like = globToSoqlLike(raw);
    if (!like.includes('%')) like = `%${like}%`;
    if (negated) {
      negative.push(`${field} NOT LIKE '${like}'`);
    } else {
      positive.push(`${field} LIKE '${like}'`);
    }
  }

  const clauses: string[] = [];
  if (positive.length === 1) clauses.push(positive[0]);
  else if (positive.length > 1) clauses.push(`(${positive.join(' OR ')})`);
  // negations are ANDed (exclude all of them)
  negative.forEach(c => clauses.push(c));

  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0];
  return clauses.join(' AND ');
}

/**
 * Convert a comma-separated list of exact picklist values to a SOQL IN clause.
 * Prefix with ! for exclusion: produces NOT IN.
 */
export function picklistToSoqlClause(values: string, field: string): string {
  if (!values) return '';
  const parts = values.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  const negated = parts[0].startsWith('!');
  const clean = parts.map(p => p.startsWith('!') ? p.slice(1).trim() : p);
  const quoted = clean.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');

  return negated
    ? `${field} NOT IN (${quoted})`
    : `${field} IN (${quoted})`;
}

/**
 * Build SOQL WHERE clauses for ownership filtering.
 * Priority: justMyData > ownerName > ownerRolePattern (mutually exclusive, first wins)
 */
export function ownershipClauses(opts: {
  ownerRolePattern?: string;
  ownerName?: string;
  justMyData?: string;
  currentUserId?: string;
  ownerField?: string;
  ownerNameField?: string;
  ownerRoleField?: string;
}): string[] {
  const {
    ownerRolePattern,
    ownerName,
    justMyData,
    currentUserId,
    ownerField = 'OwnerId',
    ownerNameField = 'Owner.Name',
    ownerRoleField = 'Owner.UserRole.Name',
  } = opts;

  if (justMyData === 'true' && currentUserId) {
    return [`${ownerField} = '${currentUserId}'`];
  }
  if (ownerName && ownerName.trim()) {
    const clause = patternToSoqlClause(ownerName.trim(), ownerNameField);
    return clause ? [clause] : [];
  }
  if (ownerRolePattern && ownerRolePattern.trim()) {
    const clause = patternToSoqlClause(ownerRolePattern.trim(), ownerRoleField);
    return clause ? [clause] : [];
  }
  return [];
}
