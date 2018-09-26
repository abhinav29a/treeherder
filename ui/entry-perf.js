// Webpack entry point for perf.html

// Vendor Styles
import 'bootstrap/dist/css/bootstrap.min.css';
import 'font-awesome/css/font-awesome.css';
import 'metrics-graphics/dist/metricsgraphics.css';

// Vendor JS
import 'bootstrap';

// Perf Styles
import './css/treeherder-global.css';
import './css/treeherder-navbar.css';
import './css/perf.css';
import './css/treeherder-loading-overlay.css';

// Bootstrap the Angular modules against which everything will be registered
import './js/perf';

// Perf JS
import './js/filters';
import './js/models/perf/issue_tracker';
import './js/models/perf/performance_framework';
import './js/models/perf/alerts';
import './js/services/perf/math';
import './js/services/perf/compare';
import './js/controllers/perf/compare';
import './js/controllers/perf/graphs';
import './js/controllers/perf/alerts';
import './js/controllers/perf/dashboard';
import './js/components/perf/compare';
import './js/components/loading';
import './js/perfapp';
