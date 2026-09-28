const subscribers = new Map();

function addSubscriber(channel, socket) {
  const sockets = subscribers.get(channel) || new Set();
  sockets.add(socket);
  subscribers.set(channel, sockets);
  socket.on('close', () => {
    sockets.delete(socket);
    if (sockets.size === 0) subscribers.delete(channel);
  });
}

function sendToChannel(channel, run) {
  const sockets = subscribers.get(channel);
  if (!sockets) return;
  const message = JSON.stringify({ type: 'WORKFLOW_RUN_UPDATE', run });
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(message);
  }
}

export const WorkflowRunEvents = {
  subscribe(runId, socket) {
    addSubscriber(`run:${runId}`, socket);
  },

  subscribeWorkflow(workflowId, socket) {
    addSubscriber(`workflow:${workflowId}`, socket);
  },

  publish(run) {
    sendToChannel(`run:${run.id}`, run);
    sendToChannel(`workflow:${run.workflowId}`, run);
  }
};

export default WorkflowRunEvents;