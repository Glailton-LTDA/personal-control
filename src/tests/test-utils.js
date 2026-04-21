import { vi } from 'vitest';

export const createSupabaseMock = (dataOverrides = {}) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    // then is special for await
    then: vi.fn((onFulfilled) => {
      // Default response
      const response = { data: [], error: null };
      return Promise.resolve(response).then(onFulfilled);
    }),
  };

  // Helper to make a method return a resolved promise
  const resolveWith = (data, error = null) => {
    return vi.fn().mockResolvedValue({ data, error });
  };

  const mock = {
    from: vi.fn((table) => {
      const tableChain = { ...chain };
      
      // Customize based on table if needed
      if (dataOverrides[table]) {
          tableChain.then = vi.fn(cb => Promise.resolve({ data: dataOverrides[table], error: null }).then(cb));
          // If we want await .order() or .maybeSingle() to work
          tableChain.order = vi.fn().mockResolvedValue({ data: dataOverrides[table], error: null });
          tableChain.maybeSingle = vi.fn().mockResolvedValue({ data: dataOverrides[table][0] || null, error: null });
          tableChain.single = vi.fn().mockResolvedValue({ data: dataOverrides[table][0] || null, error: null });
      }

      return tableChain;
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user', email: 'test@example.com' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    functions: {
        invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }
  };

  return mock;
};
