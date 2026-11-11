const { expo } = require('./app.json');
const { languages } = require('./store/listing.json');

const locales = { en: 'en-GB', ru: 'ru', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };

// Source text remains in listing.json. Review credentials are entered by the owner in the console.
module.exports = {
  configVersion: 0,
  apple: {
    version: expo.version,
    copyright: '2026 FDS Cards Ltd.',
    release: { automaticRelease: false },
    info: Object.fromEntries(Object.entries(languages).map(([language, listing]) => [
      locales[language],
      {
        title: listing.appStore.name,
        subtitle: listing.appStore.subtitle,
        description: listing.description,
        promoText: listing.appStore.promotionalText,
        keywords: listing.appStore.keywords.split(','),
        ...(listing.appStore.whatsNew ? { releaseNotes: listing.appStore.whatsNew } : {}),
        marketingUrl: 'https://hexa-tech.uk',
        supportUrl: 'https://hexa-tech.uk/about-us',
        privacyPolicyUrl: 'https://app.hexa-tech.uk/privacy',
        privacyChoicesUrl: 'https://app.hexa-tech.uk/data-deletion',
        // 2.0 screenshots include booking flows. Replace with current physical-device captures before review.
        // Do not automatically sync historical screenshots with 2.1 metadata.
      },
    ])),
  },
};
