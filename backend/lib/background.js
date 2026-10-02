// Fire-and-forget work (sending email) that must never affect the response
// and must never become an unhandled rejection. Tracked so tests (and a
// graceful shutdown, if one is ever added) can wait for it to finish.
const pending = new Set();

function runInBackground(task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => {
      // Message only: errors from the mail path must not drag request data
      // (tokens, addresses) into the logs.
      console.error("Background task failed:", err && err.message ? err.message : "unknown error");
    })
    .finally(() => pending.delete(promise));
  pending.add(promise);
  return promise;
}

async function whenIdle() {
  while (pending.size > 0) await Promise.all([...pending]);
}

module.exports = { runInBackground, whenIdle };
