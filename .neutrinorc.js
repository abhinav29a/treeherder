// `use strict` is still necessary here since this file is not treated as a module.
'use strict'; // eslint-disable-line strict, lines-around-directive

const BACKEND = process.env.BACKEND || 'https://treeherder.mozilla.org';

module.exports = {
  options: {
    source: 'ui/',
    mains: {
      index: {
        entry: 'job-view/index.jsx',
        favicon: 'ui/img/tree_open.png',
        title: 'Treeherder',
      },
      logviewer: {
        entry: 'entry-logviewer.js',
        template: 'ui/logviewer.html',
      },
      userguide: {
        entry: 'userguide/index.jsx',
        favicon: 'ui/img/tree_open.png',
        title: 'Treeherder User Guide',
      },
      login: {
        entry: 'login-callback/index.jsx',
        title: 'Treeherder Login',
      },
      testview: {
        entry: 'test-view/index.jsx',
        title: 'Treeherder Test View',
      },
      perf: {
        entry: 'entry-perf.js',
        template: 'ui/perf.html',
      },
      'intermittent-failures': {
        entry: 'intermittent-failures/index.jsx',
        title: 'Intermittent Failures View',
      },
    },
    tests: 'tests/ui/',
  },
  use: [
    process.env.NODE_ENV !== 'production' && ['@neutrinojs/eslint', {
      eslint: {
        // We manage our lint config in .eslintrc.js instead of here.
        useEslintrc: true,
      },
    }],
    ['@neutrinojs/react', {
      devServer: {
        historyApiFallback: false,
        open: !process.env.MOZ_HEADLESS,
        proxy: {
          // Proxy any paths not recognised by webpack to the specified backend.
          '*': {
            changeOrigin: true,
            headers: {
              // Prevent Django CSRF errors, whilst still making it clear
              // that the requests were from local development.
              referer: `${BACKEND}/webpack-dev-server`,
            },
            target: BACKEND,
            onProxyRes: (proxyRes) => {
              // Strip the cookie `secure` attribute, otherwise production's cookies
              // will be rejected by the browser when using non-HTTPS localhost:
              // https://github.com/nodejitsu/node-http-proxy/pull/1166
              const removeSecure = str => str.replace(/; secure/i, '');
              const cookieHeader = proxyRes.headers['set-cookie'];
              if (cookieHeader) {
                proxyRes.headers['set-cookie'] = Array.isArray(cookieHeader)
                  ? cookieHeader.map(removeSecure)
                  : removeSecure(cookieHeader);
              }
            },
          },
        },
        // Inside Vagrant filesystem watching has to be performed using polling mode,
        // since inotify doesn't work with Virtualbox shared folders.
        watchOptions: process.env.USE_WATCH_POLLING && {
          // Poll only once a second and ignore the node_modules folder to keep CPU usage down.
          poll: 1000,
          ignored: /node_modules/,
        },
      },
      devtool: {
        // Enable source maps for `yarn build` too (but not on CI, since it doubles build times).
        production: process.env.CI ? false : 'source-map',
      },
      style: {
        // Disable Neutrino's CSS modules support, since we don't use it.
        modules: false,
      },
      targets: {
        browsers: [
          'last 1 Chrome versions',
          'last 1 Edge versions',
          'last 1 Firefox versions',
          'last 1 Safari versions',
        ],
      },
    }],
    (neutrino) => {
      neutrino.config.plugin('copy').use(require.resolve('copy-webpack-plugin'), [[
        'ui/contribute.json',
        'ui/revision.txt',
        'ui/robots.txt',
      ]]);

      if (process.env.NODE_ENV === 'production') {
        neutrino.config.performance
          .hints('error')
          .maxEntrypointSize(1.63 * 1024 * 1024)
          .maxAssetSize(1.23 * 1024 * 1024);
      }
    },
  ],
};
