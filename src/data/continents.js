export const COUNTRY_TO_CONTINENT = {
  // South America
  'Brasil': 'América do Sul',
  'Argentina': 'América do Sul',
  'Chile': 'América do Sul',
  'Uruguai': 'América do Sul',
  'Paraguai': 'América do Sul',
  'Colômbia': 'América do Sul',
  'Peru': 'América do Sul',
  'Equador': 'América do Sul',
  'Bolívia': 'América do Sul',
  'Venezuela': 'América do Sul',

  // Europe
  'Itália': 'Europa',
  'França': 'Europa',
  'Inglaterra': 'Europa',
  'Reino Unido': 'Europa',
  'Espanha': 'Europa',
  'Portugal': 'Europa',
  'Alemanha': 'Europa',
  'Suíça': 'Europa',
  'Holanda': 'Europa',
  'Bélgica': 'Europa',
  'Áustria': 'Europa',
  'Grécia': 'Europa',
  'Turquia': 'Europa',
  'Irlanda': 'Europa',
  'Escócia': 'Europa',

  // North America
  'EUA': 'América do Norte',
  'Estados Unidos': 'América do Norte',
  'Canadá': 'América do Norte',
  'México': 'América do Norte',

  // Asia
  'Japão': 'Ásia',
  'China': 'Ásia',
  'Coreia do Sul': 'Ásia',
  'Tailândia': 'Ásia',
  'Vietnã': 'Ásia',
  'Indonésia': 'Ásia',
  'Índia': 'Ásia',
  'Israel': 'Ásia',

  // Africa
  'Egito': 'África',
  'África do Sul': 'África',
  'Marrocos': 'África',

  // Oceania
  'Austrália': 'Oceania',
  'Nova Zelândia': 'Oceania'
};

export const getContinent = (country) => {
  if (!country) return 'Desconhecido';
  return COUNTRY_TO_CONTINENT[country] || 'Outros';
};
