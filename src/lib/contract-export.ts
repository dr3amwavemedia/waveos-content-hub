export type ExportContract = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
};
export function contractRecordsCsv(contracts: ExportContract[]): string {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = contracts.map((c) => [
    c.id,
    c.title,
    c.description,
    c.status,
    c.sent_at,
    c.signed_at,
    c.expires_at,
  ]);
  return (
    "\uFEFF" +
    [
      [
        "Record ID",
        "Title",
        "Description",
        "Recorded status",
        "Sent (ISO)",
        "Recorded signed (ISO)",
        "Expires (ISO)",
      ],
      ...rows,
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
