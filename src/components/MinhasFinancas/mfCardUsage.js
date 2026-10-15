/**
 * Helpers da barra de uso do limite do cartão (MFCartoes).
 *
 * Motivo: uso pequeno (ex.: C6 R$ 311 de R$ 30 mil = 1%) sumia no trilho
 * e preto (#000000) no tema escuro era invisível — só o Nomand (laranja)
 * aparecia. Ficam aqui (fora do JSX) para o fast-refresh não reclamar
 * de exports não-componente no arquivo da tela.
 */

/**
 * % de uso do limite com piso visível: quando há uso, mínimo de 2,5%.
 * Sem limite ou sem uso, 0.
 */
export function mfCardUsagePct(used, limit) {
  if (!limit || limit <= 0 || used <= 0) return 0;
  return Math.min(100, Math.max((used / limit) * 100, 2.5));
}

/**
 * Cor do progresso: a cor do cartão quando tem contraste no tema escuro;
 * preto (luminância < 0,18) ou cor ausente cai para a cor primária.
 */
export function mfCardBarColor(color) {
  const hex = String(color ?? '').trim();
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 'var(--primary)';
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.18 ? 'var(--primary)' : color;
}
