import store from './store';

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export function getTaskList() {
  return delay().then(() => ({ code: 200, data: store.getTaskList() }));
}

export function getTaskDetail(id) {
  return delay().then(() => {
    const data = store.getTaskDetail(id);
    if (!data) return { code: 404, data: null };
    return { code: 200, data };
  });
}

export function getMyPublished() {
  return delay().then(() => ({ code: 200, data: store.getMyPublished() }));
}

export function getMyTaken() {
  return delay().then(() => ({ code: 200, data: store.getMyTaken() }));
}

export function publishTask(payload) {
  return delay().then(() => {
    const data = store.createTask(payload);
    return { code: 200, data };
  });
}

export function claimTask(id, takerName) {
  return delay().then(() => {
    const data = store.claimTask(id, takerName);
    if (!data) return { code: 400, data: null };
    return { code: 200, data };
  });
}

export function submitComplete(id, proofText, proofImages) {
  return delay().then(() => {
    const data = store.submitComplete(id, proofText, proofImages);
    if (!data) return { code: 400, data: null };
    return { code: 200, data };
  });
}

export function confirmComplete(id) {
  return delay().then(() => {
    const data = store.confirmComplete(id);
    if (!data) return { code: 400, data: null };
    return { code: 200, data };
  });
}

export function cancelTask(id) {
  return delay().then(() => {
    const data = store.cancelTask(id);
    if (!data) return { code: 400, data: null };
    return { code: 200, data };
  });
}

export const STATUS = store.STATUS;
