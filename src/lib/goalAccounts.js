/** Additive shared contract; legacy snapshots may contain only account_id. */
export function goalAccountIds(goal) {
  return [
    ...new Set(
      (Array.isArray(goal?.account_ids)
        ? goal.account_ids
        : [goal?.account_id]
      ).filter(Boolean),
    ),
  ];
}
export function goalLinkedBalance(goal, balances) {
  let cents = 0n;
  for (const id of goalAccountIds(goal)) {
    if (balances[id] == null) return NaN;
    const amount = Math.round(Number(balances[id]) * 100);
    if (!Number.isSafeInteger(amount)) return NaN;
    cents += BigInt(amount);
  }
  const total = Number(cents);
  return Number.isSafeInteger(total) ? total / 100 : NaN;
}
export function goalBalanceKnown(goal, balances) {
  return Number.isFinite(goalLinkedBalance(goal, balances));
}
