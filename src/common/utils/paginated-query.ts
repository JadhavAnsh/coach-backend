export async function paginateQuery<T>(
  query: {
    model: { countDocuments: (filter: unknown) => Promise<number> }
    skip: (n: number) => { limit: (n: number) => Promise<T[]> }
  },
  countQuery: unknown,
  skip = 0,
  limit = 10
): Promise<{ totalCount: number; skip: number; limit: number; data: T[] }> {
  const [totalCount, data] = await Promise.all([
    query.model.countDocuments(countQuery),
    query.skip(skip).limit(limit),
  ])

  return { totalCount, skip, limit, data }
}
