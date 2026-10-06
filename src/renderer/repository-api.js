// The main process sends repositories as JSON strings; parsing here avoids contextBridge's slow deep copy.
export async function openRepository(repositoryPath) {
  return JSON.parse(await window.mergentra.openRepositoryJson(repositoryPath));
}

export async function fetchRemoteReferences() {
  const result = await window.mergentra.fetchRemoteReferences();
  return result.repository ? { ...result, repository: JSON.parse(result.repository) } : result;
}
