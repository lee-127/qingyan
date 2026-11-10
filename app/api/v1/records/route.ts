import { owner, database, failure } from "@/lib/server";
export async function GET() {
  try {
    const uid = await owner();
    const result = await database()
      .prepare(
        "SELECT id, kind, data, created_at, updated_at FROM records WHERE owner = ? ORDER BY created_at DESC",
      )
      .bind(uid)
      .all<any>();
    const data: any = {
      material: [],
      mistake: [],
      paper: [],
      score: [],
      settings: [],
      folder: [],
    };
    for (const r of result.results)
      if (data[r.kind])
        data[r.kind].push({
          ...JSON.parse(r.data),
          id: r.id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
