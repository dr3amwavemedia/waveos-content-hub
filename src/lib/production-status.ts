type StatusQuery = {
  eq: (column: string, value: string) => StatusQuery;
  select: (columns: string) => PromiseLike<{ data: Array<{ id: string }> | null; error: unknown }>;
};
type StatusDatabase = {
  from: (table: string) => { update: (values: { status: string }) => StatusQuery };
};

export async function saveProductionStatus(
  database: StatusDatabase,
  project: { id: string; status: string },
  status: string,
) {
  const { data, error } = await database
    .from("production_projects")
    .update({ status })
    .eq("id", project.id)
    .eq("status", project.status)
    .select("id");
  if (error) throw error;
  if (!data?.length)
    throw new Error("This project's status or your access changed. Reload before trying again.");
}
