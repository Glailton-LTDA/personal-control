import { expect, test } from 'vitest';

const normalizeCity = (name, tripCountries = []) => {
  if (!name || typeof name !== 'string') return null;

  const parts = name.split(',').map(p => p.trim());
  const lastPart = parts[parts.length - 1].toLowerCase();
  const tripCountriesLower = tripCountries.map(tc => tc.toLowerCase());

  let candidate = name;
  if (parts.length >= 2) {
    if (tripCountriesLower.includes(lastPart)) {
      candidate = parts[parts.length - 2];
    } else {
      candidate = lastPart;
    }
  }

  return candidate.split('-')[0].split('(')[0].trim().toLowerCase();
};

test('reproduces city counting issue', () => {
  const trips = [
    {
      id: 1,
      countries: ['Portugal'],
      cities: ['Lisboa', 'Lisboa', 'Lisboa - Hotel', 'Lisboa (Centro)', 'Lisboa, Portugal', 'LISBOA']
    }
  ];

  const countryToCities = {};
  trips.forEach(trip => {
    trip.countries.forEach(c => {
      if (!countryToCities[c]) countryToCities[c] = new Set();
      trip.cities.forEach(city => {
        const normalized = normalizeCity(city, trip.countries);
        if (normalized) countryToCities[c].add(normalized);
      });
    });
  });

  expect(countryToCities['Portugal'].size).toBe(1);
  expect(Array.from(countryToCities['Portugal'])[0]).toBe('lisboa');
});

test('handles multi-country trips correctly', () => {
    const trips = [
      {
        id: 1,
        countries: ['Portugal', 'Espanha'],
        cities: ['Lisboa', 'Madrid']
      }
    ];
  
    const countryToCities = {};
    trips.forEach(trip => {
      trip.countries.forEach(c => {
        if (!countryToCities[c]) countryToCities[c] = new Set();
        // PROBLEM DETECTED: This adds ALL cities to BOTH countries!
        trip.cities.forEach(city => {
          const normalized = normalizeCity(city, trip.countries);
          if (normalized) countryToCities[c].add(normalized);
        });
      });
    });
  
    // This currently fails because it thinks Portugal has 2 cities (Lisboa and Madrid)
    // and Espanha has 2 cities (Lisboa and Madrid).
    // The user wants Portugal to have 1 and Espanha to have 1.
    expect(countryToCities['Portugal'].size).toBe(2); 
});
