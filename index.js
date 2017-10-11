const {join, dirname, basename, sep} = require('path');

const statuses = {
  passing: {
    state: 'success',
    description: 'Migration guide provided',
  },
  failing: {
    state: 'failure',
    description: 'PRs with breaking changes must provide a migration guide',
    // target_url: 'https://github.com/',
  },
};

module.exports = robot => {
  robot.on('pull_request.opened', check);
  robot.on('pull_request.edited', check);
  robot.on('pull_request.synchronize', check);
  robot.on('pull_request.updated', check);
  robot.on('pull_request.labeled', check);
  robot.on('pull_request.unlabeled', check);

  async function check(context) {
    const pr = context.payload.pull_request;

    function setStatus(status) {
      const params = Object.assign(
        {
          sha: pr.head.sha,
          context: 'migration',
        },
        status,
      );
      return github.repos.createStatus(context.repo(params));
    }

    const filename = `${pr.number.toString().padStart(5, '0')}.md`;

    const labels = await context.github.issues.getIssueLabels(
      context.repo({number: pr.number}),
    );

    const isBreaking = labels.data.reduce((breaking, label) => {
      return breaking || label.name === 'breaking';
    }, false);

    if (isBreaking) {
      const compare = await context.github.repos.compareCommits(
        context.repo({
          base: pr.base.sha,
          head: pr.head.sha,
        }),
      );

      const packages = [''];

      compare.data.files.forEach(file => {
        const subpackage = inSubPackage(file.filename);
        if (subpackage) {
          packages.push(subpackage);
        }
      });

      Promise.all(
        packages.map(async pkg => {
          try {
            const res = await context.github.repos.getContent(
              context.repo({
                path: join(pkg, 'docs/migrations'),
                ref: pr.head.sha,
              }),
            );
            const files = res.data.map(file => file.path);
            return files;
          } catch (err) {
            if (err.code !== 404) {
              throw err;
            }
            return [];
          }
        }),
      ).then(res => {
        /**
         * At least one package needs to have a migration guide
         */
        const didPass = res.reduce((outer, files) => {
          return files.reduce((inner, filepath) => {
            return inner || basename(filepath) === filename;
          }, outer);
        }, false);
        setStatus(didPass ? statuses.passing : statuses.failing);
      });
    } else {
      setStatus(statuses.passing);
    }
  }
};

function inSubPackage(filepath) {
  const dirs = dirname(filepath).split(sep);
  if (dirs.length < 2) {
    return false;
  }
  if (dirs[0] !== 'packages') {
    return false;
  }
  return join(dirs[0], dirs[1]);
}
