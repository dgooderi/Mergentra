import { viewStorage } from './app-storage.js';

export function renderRecentRepositories(repositories, onOpen) {
  const list = document.getElementById('recent-repositories');
  list.replaceChildren();

  if (repositories.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-recent';
    emptyState.textContent = 'Repositories you open will appear here.';
    list.append(emptyState);
    return;
  }

  for (const repository of repositories) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const name = document.createElement('span');
    const repositoryNote = viewStorage.readRepositoryNote(repository.path);
    button.className = 'recent-repository';
    button.type = 'button';
    name.textContent = repository.name;
    button.title = repository.path;
    button.append(name);
    if (repositoryNote) {
      const note = document.createElement('small');
      note.textContent = repositoryNote;
      button.append(note);
    }
    button.addEventListener('click', () => {
      onOpen(repository.path, button);
    });
    item.append(button);
    list.append(item);
  }
}
