// In-memory API adapter for component tests; never contacts a Supabase project.
export function createQueryServer() {
  const server = {
    tables: {},
    calls: [],
    failures: {},
    emptyWrites: false,
    serial: 0,
  };
  server.from = (table) => {
    const request = { table, operation: "select", filters: [], payload: null };
    const query = {};
    for (const method of [
      "select",
      "order",
      "limit",
      "range",
      "single",
      "maybeSingle",
      "eq",
      "neq",
      "in",
      "gte",
      "lte",
      "ilike",
      "or",
      "insert",
      "upsert",
      "update",
      "delete",
    ]) {
      query[method] = (...args) => {
        server.calls.push([table, method, ...args]);
        if (["insert", "upsert", "update", "delete"].includes(method)) {
          request.operation = method;
          request.payload = args[0];
        }
        if (["eq", "neq", "in", "gte", "lte"].includes(method))
          request.filters.push([method, ...args]);
        if (["single", "maybeSingle"].includes(method)) request.single = true;
        return query;
      };
    }
    query.then = (resolve, reject) =>
      Promise.resolve()
        .then(() => {
          const error = server.failures[`${table}:${request.operation}`];
          if (error) return { data: null, error: new Error(error) };
          const rows = server.tables[table] || [];
          const matches = (row) =>
            request.filters.every(([op, key, value]) =>
              op === "eq"
                ? row[key] === value
                : op === "neq"
                  ? row[key] !== value
                  : op === "in"
                    ? value.includes(row[key])
                    : op === "gte"
                      ? row[key] >= value
                      : row[key] <= value,
            );
          let data = rows.filter(matches);
          if (
            request.operation === "insert" ||
            request.operation === "upsert"
          ) {
            data = (
              Array.isArray(request.payload)
                ? request.payload
                : [request.payload]
            ).map((row) => ({ id: `created-${++server.serial}`, ...row }));
            server.tables[table] = [...rows, ...data];
          } else if (request.operation === "update") {
            server.tables[table] = rows.map((row) =>
              matches(row) ? { ...row, ...request.payload } : row,
            );
            data = server.tables[table].filter(matches);
          } else if (request.operation === "delete")
            server.tables[table] = rows.filter((row) => !matches(row));
          if (server.emptyWrites && request.operation !== "select") data = [];
          return { data: request.single ? data[0] || null : data, error: null };
        })
        .then(resolve, reject);
    return query;
  };
  return server;
}
