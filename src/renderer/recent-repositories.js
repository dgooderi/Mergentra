import { viewStorage } from './app-storage.js';
import { markdownToPlainText } from './markdown.js';

export function renderRecentRepositories(repositories, { onSelect, onRemove }) {
  const select = document.getElementById('recent-repositories');
  const removeButton = document.getElementById('recent-remove');
  select.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent =
    repositories.length === 0
      ? 'Repositories you open will appear here'
      : 'Choose a recent repository…';
  select.append(placeholder);

  for (const repository of repositories) {
    const option = document.createElement('option');
    const repositoryNote = markdownToPlainText(
      viewStorage.readRepositoryNote(repository.path)
    ).replaceAll('\n', ' ');
    option.value = repository.path;
    option.title = repository.path;
    option.textContent = repositoryNote
      ? `${repository.name} — ${repositoryNote}`
      : repository.name;
    select.append(option);
  }

  select.disabled = repositories.length === 0;
  removeButton.disabled = true;
  select.onchange = () => {
    removeButton.disabled = select.value === '';
    if (select.value !== '') {
      onSelect(select.value);
    }
  };
  removeButton.onclick = () => {
    if (select.value !== '') {
      onRemove(select.value);
    }
  };
}
