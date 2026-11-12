const { expo } = require('./app.json');
const { languages } = require('./store/listing.json');

const locales = { en: 'en-GB', ru: 'ru', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };

// Source text remains in listing.json. Review credentials are entered by the owner in the console.
module.exports = {
  configVersion: 0,
  apple: {
    version: expo.version,
    copyright: '2026 FDS Cards Ltd.',
    // Public publication was authorized on 12 November 2026; release after Apple approval.
    release: { automaticRelease: true },
    info: Object.fromEntries(Object.entries(languages).map(([language, listing]) => [
      locales[language],
      {
        title: listing.appStore.name,
        subtitle: listing.appStore.subtitle,
        description: listing.description,
        promoText: listing.appStore.promotionalText,
        keywords: listing.appStore.keywords.split(','),
        // 2.1.0 is the first public-version submission; Apple does not accept What's New for that submission.
        ...(expo.version !== '2.1.0' && listing.appStore.whatsNew ? { releaseNotes: listing.appStore.whatsNew } : {}),
        marketingUrl: 'https://hexa-tech.uk',
        supportUrl: 'https://hexa-tech.uk/about-us',
        privacyPolicyUrl: 'https://app.hexa-tech.uk/privacy',
        privacyChoicesUrl: 'https://app.hexa-tech.uk/data-deletion',
        // Current 2.1 UI captures are in store/screenshots/2.1.0 (see its provenance README).
        // Uploaded and verified in the stores separately; never sync the historical 2.0 booking images.
      },
    ])),
  },
};
