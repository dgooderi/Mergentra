import { viewStorage } from './app-storage.js';
import { markdownToPlainText } from './markdown.js';

export function renderRecentRepositories(repositories, { onSelect, onRemove, onRename }) {
  const select = document.getElementById('recent-repositories');
  const nameInput = document.getElementById('recent-name');
  const editButton = document.getElementById('recent-edit');
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
    const label = repository.displayName || repository.name;
    option.value = repository.path;
    option.title = repository.path;
    option.textContent = repositoryNote ? `${label} — ${repositoryNote}` : label;
    select.append(option);
  }

  const stopEditing = () => {
    nameInput.hidden = true;
    select.hidden = false;
  };
  stopEditing();

  select.disabled = repositories.length === 0;
  editButton.disabled = true;
  removeButton.disabled = true;
  select.onchange = () => {
    editButton.disabled = select.value === '';
    removeButton.disabled = select.value === '';
    if (select.value !== '') {
      onSelect(select.value);
    }
  };
  editButton.onclick = () => {
    const repository = repositories.find((candidate) => candidate.path === select.value);
    if (!repository) {
      return;
    }
    nameInput.value = repository.displayName || repository.name;
    select.hidden = true;
    nameInput.hidden = false;
    nameInput.focus();
    nameInput.select();
  };
  nameInput.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onRename(select.value, nameInput.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      stopEditing();
    }
  };
  removeButton.onclick = () => {
    const repository = repositories.find((candidate) => candidate.path === select.value);
    if (
      repository &&
      window.confirm(
        `Remove "${repository.displayName || repository.name}" from the recent list?\n\nThe folder on disk is not deleted.`
      )
    ) {
      onRemove(select.value);
    }
  };
}
