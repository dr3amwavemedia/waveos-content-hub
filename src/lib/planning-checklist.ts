/** Plain-text checklists stay readable by existing editors and exports. */
export function checklistRows(value: string) {
  return value.split("\n").flatMap((line, index) => {
    const match = /^\s*[-*] \[([ xX])\] (.*)$/.exec(line);
    return match ? [{ index, checked: match[1].toLowerCase() === "x", label: match[2] }] : [];
  });
}

export function toggleChecklistRow(value: string, index: number) {
  return value
    .split("\n")
    .map((line, i) =>
      i === index
        ? line.replace(
            /^(\s*[-*] \[)([ xX])(\] )/,
            (_, start, state, end) => `${start}${state === " " ? "x" : " "}${end}`,
          )
        : line,
    )
    .join("\n");
}

export function appendChecklistRow(value: string, label: string) {
  const text = label.trim().replace(/[\r\n]+/g, " ");
  return text ? `${value}${value && !value.endsWith("\n") ? "\n" : ""}- [ ] ${text}` : value;
}
export function editChecklistRow(value: string, index: number, label: string) {
  const text = label.trim().replace(/[\r\n]+/g, " ");
  if (!text) return value;
  return value
    .split("\n")
    .map((line, i) =>
      i === index ? line.replace(/^(\s*[-*] \[[ xX]\] ).*$/, (_, prefix) => prefix + text) : line,
    )
    .join("\n");
}
export function removeChecklistRow(value: string, index: number) {
  return value
    .split("\n")
    .filter((line, i) => i !== index || !/^\s*[-*] \[[ xX]\] /.test(line))
    .join("\n");
}
