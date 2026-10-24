import { getLocales } from 'expo-localization';

export type Lang = 'es' | 'en';

const es = {
  tabGame: 'Juego',
  tabRanking: 'Ranking',
  tabSettings: 'Ajustes',

  tagline: 'Recorre el mundo sin salir del mapa.',
  pickMode: 'Elige un modo',
  modeCountries: 'Países',
  modeCountriesDesc: 'Te marcamos un país: elige su nombre. Cada pocos aciertos, más difícil.',
  modeCapitals: 'Capitales',
  modeCapitalsDesc: 'Un punto marca una capital: elige cuál es. Si fallas, vuelves a 0.',
  record: 'Récord',
  points: 'Puntos',

  askCountry: '¿Qué país es este?',
  askCapital: '¿Qué capital es esta?',
  correct: (pts: number) => `¡Bien! +${pts}`,
  newRecord: '¡Nuevo récord!',
  wrong: 'Casi… vuelves a 0',
  itWas: (answer: string) => `Era ${answer}`,
  next: 'Siguiente',
  level: (n: number) => `Nivel ${n}`,
  toNext: (n: number) => (n === 1 ? 'Falta 1 para subir de nivel' : `Faltan ${n} para subir de nivel`),
  maxLevel: 'Nivel máximo',
  close: 'Salir',

  recordLabel: (n: number) => `Récord: ${n}`,
  rankingTitle: 'Ranking',
  rankingSoon: 'Muy pronto',
  rankingBody: 'Aquí verás cómo quedas frente a otros jugadores. De momento, compite contra tu récord.',
  yourRecords: 'Tus récords',
  you: 'Tú',
  rankingNote: '1 jugador · El ranking en línea llega pronto',

  settingsTitle: 'Ajustes',
  appearance: 'Apariencia',
  auto: 'Automático',
  appearanceAuto: 'Claro u oscuro, como tenga el móvil.',
  themeDark: 'Oscuro',
  themeLight: 'Claro',
  sound: 'Sonido',
  soundText: 'Sonidos al acertar, fallar y batir un récord.',
  soundOff: 'Sin sonido',
  soundLow: 'Bajo',
  soundMedium: 'Medio',
  soundHigh: 'Alto',
  volume: (v: string) => `Volumen: ${v}`,
  language: 'Idioma',
  languageAuto: 'En el idioma del móvil.',
  creditsTitle: 'Créditos',
  credits: 'Mapa: Natural Earth, de dominio público.',
  creditsLink: 'Ver Natural Earth',
  version: (v: string) => `Versión ${v}`,
};

export type Strings = typeof es;

const en: Strings = {
  tabGame: 'Game',
  tabRanking: 'Ranking',
  tabSettings: 'Settings',

  tagline: 'Travel the world without leaving the map.',
  pickMode: 'Pick a mode',
  modeCountries: 'Countries',
  modeCountriesDesc: 'We mark a country: pick its name. Every few right answers, it gets harder.',
  modeCapitals: 'Capitals',
  modeCapitalsDesc: 'A dot marks a capital: pick which one. Miss and you go back to 0.',
  record: 'Record',
  points: 'Points',

  askCountry: 'Which country is this?',
  askCapital: 'Which capital is this?',
  correct: (pts: number) => `Nice! +${pts}`,
  newRecord: 'New record!',
  wrong: 'So close… back to 0',
  itWas: (answer: string) => `It was ${answer}`,
  next: 'Next',
  level: (n: number) => `Level ${n}`,
  toNext: (n: number) => `${n} more to level up`,
  maxLevel: 'Top level',
  close: 'Quit',

  recordLabel: (n: number) => `Record: ${n}`,
  rankingTitle: 'Ranking',
  rankingSoon: 'Coming soon',
  rankingBody: 'This is where you will see how you stack up against other players. For now, beat your own record.',
  yourRecords: 'Your records',
  you: 'You',
  rankingNote: '1 player · Online rankings are coming soon',

  settingsTitle: 'Settings',
  appearance: 'Appearance',
  auto: 'Automatic',
  appearanceAuto: 'Light or dark, like your phone.',
  themeDark: 'Dark',
  themeLight: 'Light',
  sound: 'Sound',
  soundText: 'Sounds for right answers, misses and new records.',
  soundOff: 'No sound',
  soundLow: 'Low',
  soundMedium: 'Medium',
  soundHigh: 'High',
  volume: (v: string) => `Volume: ${v}`,
  language: 'Language',
  languageAuto: 'In your phone’s language.',
  creditsTitle: 'Credits',
  credits: 'Map: Natural Earth, public domain.',
  creditsLink: 'See Natural Earth',
  version: (v: string) => `Version ${v}`,
};

export const strings: Record<Lang, Strings> = { es, en };

/** Spanish unless the phone prefers English. */
export function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}
