import React from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { thEvents } from '../../../helpers/constants';
import { formatTaskclusterError } from '../../../helpers/errorMessage';
import { isReftest, isPerfTest } from '../../../helpers/job';
import { getInspectTaskUrl, getReftestUrl } from '../../../helpers/url';
import JobModel from '../../../models/job';
import TaskclusterModel from '../../../models/taskcluster';
import CustomJobActions from '../../CustomJobActions';
import LogUrls from './LogUrls';
import { withSelectedJob } from '../../context/SelectedJob';
import { withPinnedJobs } from '../../context/PinnedJobs';
import { withPushes } from '../../context/Pushes';
import { withNotifications } from '../../../shared/context/Notifications';

class ActionBar extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      customJobActionsShowing: false,
    };
  }

  componentDidMount() {
    this.toggleCustomJobActions = this.toggleCustomJobActions.bind(this);
    this.createGeckoProfile = this.createGeckoProfile.bind(this);
    this.createInteractiveTask = this.createInteractiveTask.bind(this);
    this.onOpenLogviewer = this.onOpenLogviewer.bind(this);
    this.onRetriggerJob = this.onRetriggerJob.bind(this);
    this.retriggerJob = this.retriggerJob.bind(this);

    window.addEventListener(thEvents.openLogviewer, this.onOpenLogviewer);
    window.addEventListener(thEvents.jobRetrigger, this.onRetriggerJob);
  }

  componentWillUnmount() {
    window.removeEventListener(thEvents.openLogviewer, this.onOpenLogviewer);
    window.removeEventListener(thEvents.jobRetrigger, this.onRetriggerJob);
  }

  onRetriggerJob(event) {
    this.retriggerJob([event.detail.job]);
  }

  // Open the logviewer and provide notifications if it isn't available
  onOpenLogviewer() {
    const { logParseStatus, notify } = this.props;

    switch (logParseStatus) {
      case 'pending':
        notify('Log parsing in progress, log viewer not yet available', 'info'); break;
      case 'failed':
        notify('Log parsing has failed, log viewer is unavailable', 'warning'); break;
      case 'unavailable':
        notify('No logs available for this job', 'info'); break;
      case 'parsed':
        $('.logviewer-btn')[0].click();
    }
  }

  canCancel() {
    const { selectedJob } = this.props;
    return selectedJob.state === 'pending' || selectedJob.state === 'running';
  }

  createGeckoProfile() {
    const { user, selectedJob, getGeckoDecisionTaskId, notify } = this.props;
    if (!user.isLoggedIn) {
      return notify('Must be logged in to create a gecko profile', 'danger');
    }

    getGeckoDecisionTaskId(
      selectedJob.push_id).then(decisionTaskId => (
      TaskclusterModel.load(decisionTaskId, selectedJob).then((results) => {
        const geckoprofile = results.actions.find(result => result.name === 'geckoprofile');

        if (geckoprofile === undefined || !geckoprofile.hasOwnProperty('kind')) {
          return notify('Job was scheduled without taskcluster support for GeckoProfiles');
        }

        TaskclusterModel.submit({
          action: geckoprofile,
          decisionTaskId,
          taskId: results.originalTaskId,
          task: results.originalTask,
          input: {},
          staticActionVariables: results.staticActionVariables,
        }).then(() => {
          notify(
            'Request sent to collect gecko profile job via actions.json',
            'success');
        }, (e) => {
          // The full message is too large to fit in a Treeherder
          // notification box.
          notify(
            formatTaskclusterError(e),
            'danger',
            { sticky: true });
        });
      })
    ));
  }

  retriggerJob(jobs) {
    const { user, repoName, getGeckoDecisionTaskId, notify } = this.props;
    const jobIds = jobs.map(({ id }) => id);

    if (!user.isLoggedIn) {
      return notify('Must be logged in to retrigger a job', 'danger');
    }

    // Spin the retrigger button when retriggers happen
    $('#retrigger-btn > span').removeClass('action-bar-spin');
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        $('#retrigger-btn > span').addClass('action-bar-spin');
      });
    });

    JobModel.retrigger(jobIds, repoName, getGeckoDecisionTaskId, notify);
  }

  backfillJob() {
    const { user, selectedJob, getGeckoDecisionTaskId, notify } = this.props;

    if (!this.canBackfill()) {
      return;
    }

    if (!user.isLoggedIn) {
      notify('Must be logged in to backfill a job', 'danger');

      return;
    }

    if (!selectedJob.id) {
      notify('Job not yet loaded for backfill', 'warning');

      return;
    }

    if (selectedJob.build_system_type === 'taskcluster' || selectedJob.reason.startsWith('Created by BBB for task')) {
      getGeckoDecisionTaskId(
        selectedJob.push_id).then(decisionTaskId => (
        TaskclusterModel.load(decisionTaskId, selectedJob).then((results) => {
          const backfilltask = results.actions.find(result => result.name === 'backfill');

          return TaskclusterModel.submit({
            action: backfilltask,
            decisionTaskId,
            taskId: results.originalTaskId,
            input: {},
            staticActionVariables: results.staticActionVariables,
          }).then(() => {
            notify('Request sent to backfill job via actions.json', 'success');
          }, (e) => {
            // The full message is too large to fit in a Treeherder
            // notification box.
            notify(formatTaskclusterError(e), 'danger', { sticky: true });
          });
        })
      ));
    } else {
      notify('Unable to backfill this job type!', 'danger', { sticky: true });
    }
  }

  // Can we backfill? At the moment, this only ensures we're not in a 'try' repo.
  canBackfill() {
    const { user, isTryRepo } = this.props;

    return user.isLoggedIn && !isTryRepo;
  }

  backfillButtonTitle() {
    const { user, isTryRepo } = this.props;
    let title = '';

    if (!user.isLoggedIn) {
      title = title.concat('must be logged in to backfill a job / ');
    }

    if (isTryRepo) {
      title = title.concat('backfill not available in this repository');
    }

    if (title === '') {
      title = 'Trigger jobs of ths type on prior pushes ' +
        'to fill in gaps where the job was not run';
    } else {
      // Cut off trailing '/ ' if one exists, capitalize first letter
      title = title.replace(/\/ $/, '');
      title = title.replace(/^./, l => l.toUpperCase());
    }
    return title;
  }

  async createInteractiveTask() {
    const { user, selectedJob, repoName, getGeckoDecisionTaskId, notify } = this.props;
    const jobId = selectedJob.id;

    if (!user.isLoggedIn) {
      return notify('Must be logged in to create an interactive task', 'danger');
    }

    const job = await JobModel.get(repoName, jobId);
    const decisionTaskId = await getGeckoDecisionTaskId(job.push_id);
    const results = await TaskclusterModel.load(decisionTaskId, job);
    const interactiveTask = results.actions.find(result => result.name === 'create-interactive');

    try {
      await TaskclusterModel.submit({
        action: interactiveTask,
        decisionTaskId,
        taskId: results.originalTaskId,
        input: {
          notify: user.email,
        },
        staticActionVariables: results.staticActionVariables,
      });

      notify(
        `Request sent to create an interactive job via actions.json.
          You will soon receive an email containing a link to interact with the task.`,
        'success');
    } catch (e) {
      // The full message is too large to fit in a Treeherder
      // notification box.
      notify(formatTaskclusterError(e), 'danger', { sticky: true });
    }
  }

  cancelJobs(jobs) {
    const { user, repoName, getGeckoDecisionTaskId, notify } = this.props;
    const jobIds = jobs.filter(({ state }) => state === 'pending' || state === 'running').map(({ id }) => id);

    if (!user.isLoggedIn) {
      return notify('Must be logged in to cancel a job', 'danger');
    }

    JobModel.cancel(jobIds, repoName, getGeckoDecisionTaskId, notify);
  }

  cancelJob() {
    this.cancelJobs([this.props.selectedJob]);
  }

  toggleCustomJobActions() {
    const { customJobActionsShowing } = this.state;

    this.setState({ customJobActionsShowing: !customJobActionsShowing });
  }

  render() {
    const { selectedJob, logViewerUrl, logViewerFullUrl, jobLogUrls, user, pinJob } = this.props;
    const { customJobActionsShowing } = this.state;

    return (
      <div id="job-details-actionbar">
        <nav className="navbar navbar-dark details-panel-navbar">
          <ul className="nav navbar-nav actionbar-nav">

            <LogUrls
              logUrls={jobLogUrls}
              logViewerUrl={logViewerUrl}
              logViewerFullUrl={logViewerFullUrl}
            />
            <li>
              <span
                id="pin-job-btn"
                title="Add this job to the pinboard"
                className="btn icon-blue"
                onClick={() => pinJob(selectedJob)}
              ><span className="fa fa-thumb-tack" /></span>
            </li>
            <li>
              <span
                id="retrigger-btn"
                title={user.isLoggedIn ? 'Repeat the selected job' : 'Must be logged in to retrigger a job'}
                className={`btn ${user.isLoggedIn ? 'icon-green' : 'disabled'}`}
                disabled={!user.isLoggedIn}
                onClick={() => this.retriggerJob([selectedJob])}
              ><span className="fa fa-repeat" /></span>
            </li>
            {isReftest(selectedJob) && jobLogUrls.map(jobLogUrl => (<li key={`reftest-${jobLogUrl.id}`}>
              <a
                title="Launch the Reftest Analyser in a new window"
                target="_blank"
                rel="noopener noreferrer"
                href={getReftestUrl(jobLogUrl.url)}
              ><span className="fa fa-bar-chart-o" /></a>
            </li>))}
            {this.canCancel() && <li>
              <a
                title={user.isLoggedIn ? 'Cancel this job' : 'Must be logged in to cancel a job'}
                className={user.isLoggedIn ? 'hover-warning' : 'disabled'}
                onClick={() => this.cancelJob()}
              ><span className="fa fa-times-circle cancel-job-icon" /></a>
            </li>}
          </ul>
          <ul className="nav navbar-right">
            <li className="dropdown">
              <span
                id="actionbar-menu-btn"
                title="Other job actions"
                aria-haspopup="true"
                aria-expanded="false"
                className="dropdown-toggle"
                data-toggle="dropdown"
              ><span className="fa fa-ellipsis-h" aria-hidden="true" /></span>
              <ul className="dropdown-menu actionbar-menu" role="menu">
                <li>
                  <span
                    id="backfill-btn"
                    className={`btn dropdown-item ${!user.isLoggedIn || !this.canBackfill() ? 'disabled' : ''}`}
                    title={this.backfillButtonTitle()}
                    onClick={() => !this.canBackfill() || this.backfillJob()}
                  >Backfill</span>
                </li>
                {selectedJob.taskcluster_metadata && <React.Fragment>
                  <li>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dropdown-item"
                      href={getInspectTaskUrl(selectedJob.taskcluster_metadata.task_id)}
                    >Inspect Task</a>
                  </li>
                  <li>
                    <a
                      className="dropdown-item"
                      onClick={this.createInteractiveTask}
                    >Create Interactive Task</a>
                  </li>
                  {isPerfTest(selectedJob) && <li>
                    <a
                      className="dropdown-item"
                      onClick={this.createGeckoProfile}
                    >Create Gecko Profile</a>
                  </li>}
                  <li>
                    <a
                      onClick={this.toggleCustomJobActions}
                      className="dropdown-item"
                    >Custom Action...</a>
                  </li>
                </React.Fragment>}
              </ul>
            </li>
          </ul>
        </nav>
        {customJobActionsShowing && <CustomJobActions
          job={selectedJob}
          pushId={selectedJob.push_id}
          isLoggedIn={user.isLoggedIn}
          toggle={this.toggleCustomJobActions}
        />}
      </div>
    );
  }
}

ActionBar.propTypes = {
  pinJob: PropTypes.func.isRequired,
  user: PropTypes.object.isRequired,
  repoName: PropTypes.string.isRequired,
  selectedJob: PropTypes.object.isRequired,
  logParseStatus: PropTypes.string.isRequired,
  getGeckoDecisionTaskId: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
  jobLogUrls: PropTypes.array,
  isTryRepo: PropTypes.bool,
  logViewerUrl: PropTypes.string,
  logViewerFullUrl: PropTypes.string,
};

ActionBar.defaultProps = {
  isTryRepo: true, // default to more restrictive for backfilling
  logViewerUrl: null,
  logViewerFullUrl: null,
  jobLogUrls: [],
};

export default withNotifications(withPushes(withSelectedJob(withPinnedJobs(ActionBar))));
