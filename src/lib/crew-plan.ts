export type CrewMember = {
  name: string;
  role: string;
  reportsTo: string;
  responsibilities: string;
};
const prefix = "Crew: ";
export function crewRows(value: string) {
  return value.split("\n").flatMap((line, index) => {
    if (!line.startsWith(prefix)) return [];
    try {
      const entry = JSON.parse(line.slice(prefix.length));
      if (
        ["name", "role", "reportsTo", "responsibilities"].every(
          (key) => typeof entry?.[key] === "string",
        )
      )
        return [
          {
            index,
            name: entry.name,
            role: entry.role,
            reportsTo: entry.reportsTo,
            responsibilities: entry.responsibilities,
          } as CrewMember & { index: number },
        ];
    } catch {
      /* Keep unrecognized notes untouched. */
    }
    return [];
  });
}
export function saveCrewRow(value: string, member: CrewMember, index?: number) {
  const line = prefix + JSON.stringify(member);
  if (index === undefined) return `${value}${value && !value.endsWith("\n") ? "\n" : ""}${line}`;
  const recognized = crewRows(value).some((row) => row.index === index);
  return recognized
    ? value
        .split("\n")
        .map((old, i) => (i === index ? line : old))
        .join("\n")
    : value;
}
export function removeCrewRow(value: string, index: number) {
  return crewRows(value).some((row) => row.index === index)
    ? value
        .split("\n")
        .filter((_, i) => i !== index)
        .join("\n")
    : value;
}
