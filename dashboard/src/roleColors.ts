/** Maps an agent's role badge text to a CSS modifier class for consistent
 * coloring wherever the role appears (drawer header, console row). */
export function roleColorClass(roleBadge: string): string {
  const key = roleBadge.toLowerCase();
  if (key.includes("procurement")) return "role-procurement";
  if (key.includes("devops")) return "role-devops";
  if (key.includes("analytics")) return "role-analytics";
  if (key.includes("marketing")) return "role-marketing";
  if (key.includes("compliance")) return "role-compliance";
  return "role-default";
}
