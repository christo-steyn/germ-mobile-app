const test = require('node:test');
const assert = require('node:assert/strict');
const configure = require('../app.config');
const config = require('../app.json').expo;

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('preview and production never opt into cleartext networking', () => {
  for (const profile of [undefined, 'preview', 'production']) {
    withEnvironment({ EAS_BUILD_PROFILE: profile }, () => {
      const result = configure({ config });
      assert.equal(result.plugins.includes('./plugins/withDevelopmentNetworking'), false);
      assert.equal(result.ios.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads, undefined);
      assert.equal(result.ios.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking, undefined);
    });
  }
});

test('only development builds opt into local networking', () => {
  withEnvironment({ EAS_BUILD_PROFILE: 'development' }, () => {
    const result = configure({ config });
    assert.equal(result.plugins.includes('./plugins/withDevelopmentNetworking'), true);
    assert.equal(result.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
  });
});

test('EAS project ID is configured from environment without a fake fallback', () => {
  withEnvironment({ EXPO_PUBLIC_EXPO_PROJECT_ID: undefined }, () => {
    assert.equal(configure({ config }).extra.eas, undefined);
  });
  withEnvironment({ EXPO_PUBLIC_EXPO_PROJECT_ID: 'test-project-id' }, () => {
    assert.equal(configure({ config }).extra.eas.projectId, 'test-project-id');
  });
});

test('both native platforms have the requested unique app identifiers', () => {
  assert.equal(config.android.package, 'com.christosteyn.germmobileapp');
  assert.equal(config.ios.bundleIdentifier, 'com.christosteyn.germmobileapp');
  assert.ok(config.plugins.includes('expo-notifications'));
});
