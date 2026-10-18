import { Routes } from '@angular/router';
import { DocumentationComponent } from './pages/documentation.component';
import { DownloadComponent } from './pages/download.component';
import { HomeComponent } from './pages/home.component';
import { ReleaseNotesComponent } from './pages/release-notes.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Mergentra | Visualize GitHub and Git history' },
  { path: 'documentation', component: DocumentationComponent, title: 'Documentation | Mergentra' },
  { path: 'release-notes', component: ReleaseNotesComponent, title: 'Release notes | Mergentra' },
  { path: 'download', component: DownloadComponent, title: 'Download Mergentra for Windows' },
  { path: '**', redirectTo: '' },
];
