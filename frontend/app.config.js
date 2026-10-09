module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  const development = process.env.EAS_BUILD_PROFILE === 'development';
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ...(development ? ['./plugins/withDevelopmentNetworking'] : []),
    ],
    ios: {
      ...config.ios,
      ...(development ? {
        infoPlist: {
          ...config.ios?.infoPlist,
          NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
        },
      } : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
