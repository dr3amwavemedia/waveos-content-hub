export type ExportContract = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
};

export function contractReportHtml(contracts: ExportContract[]): string {
  const escape = (value: string | null) =>
    (value ?? "").replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
  return `<!doctype html><html><head><meta charset="utf-8"><title>WaveOS contract records</title><style>@page{size:landscape;margin:15mm}body{font:11px system-ui;color:#18232b}h1{font-size:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{color:#555}</style></head><body><h1>Dream Wave Media · Contract records</h1><p>Recorded dates and statuses only. This report does not contain the executed agreements or signing evidence.</p><table><thead><tr>${["Record ID", "Title", "Description", "Status", "Sent (ISO)", "Signed (ISO)", "Expires (ISO)"].map((title) => `<th>${title}</th>`).join("")}</tr></thead><tbody>${contracts.map((c) => `<tr>${[c.id, c.title, c.description, c.status, c.sent_at, c.signed_at, c.expires_at].map((value) => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
}
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
