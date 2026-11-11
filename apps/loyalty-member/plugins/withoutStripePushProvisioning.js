// The app never uses Stripe's push provisioning (adding a card to Google Wallet), and two parts of stripe-react-native
// 0.81 stop an Android release build without it:
//
// 1. Its push-provisioning library is a compileOnly dependency that lists Google's Tap and Pay SDK as a runtime
//    dependency. Google distributes Tap and Pay privately, so the release lint step, which resolves every dependency's
//    runtime files to look for lint rules, stops with "Could not find com.google.android.gms:play-services-tapandpay".
//    android/build.gradle gets an exclusion for that one module.
// 2. Its own code refers to the push-provisioning classes, which are therefore missing from the app, and the library's
//    consumer rules silence only Tap and Pay's. R8 stops with "Missing class
//    com.stripe.android.pushProvisioning.…"; android/app/proguard-rules.pro gets the -dontwarn R8 asks for.
//
// Neither library is packaged either way; the release lint and R8 stay on for everything else.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withProjectBuildGradle } = require('expo/config-plugins');

const MARK = '# withoutStripePushProvisioning';
const GRADLE_MARK = '// withoutStripePushProvisioning';

const GRADLE = `
${GRADLE_MARK}
allprojects {
  configurations.configureEach {
    exclude group: 'com.google.android.gms', module: 'play-services-tapandpay'
  }
}
`;

const PROGUARD = `
${MARK}
-dontwarn com.stripe.android.pushProvisioning.**
`;

function withTapAndPayExcluded(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withoutStripePushProvisioning expects a Groovy android/build.gradle');
    }
    if (!mod.modResults.contents.includes(GRADLE_MARK)) {
      mod.modResults.contents += GRADLE;
    }
    return mod;
  });
}

function withPushProvisioningUnwarned(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const contents = fs.readFileSync(file, 'utf8');
      if (!contents.includes(MARK)) {
        fs.writeFileSync(file, contents + PROGUARD);
      }
      return mod;
    },
  ]);
}

module.exports = function withoutStripePushProvisioning(config) {
  return withPushProvisioningUnwarned(withTapAndPayExcluded(config));
};
