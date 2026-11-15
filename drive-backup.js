/* Sauvegarde Google Drive : la sélection et l'autorisation restent explicites. */
const DRIVE_CLIENT_ID = '703028286961-g5high53sevg6g5nkc191db2meprdqs1.apps.googleusercontent.com';
const DRIVE_BROWSER_KEY = 'AIzaSyBMhR40EUgocj6QhghpgzygSUxxVFpw6vw';
const DRIVE_APP_ID = '703028286961';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let driveLibrariesReady = false;
let driveLibrariesLoading = false;
function loadDriveScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error('Impossible de charger les services Google.'));
    document.head.appendChild(script);
  });
}
async function prepareDriveLibraries() {
  if (driveLibrariesReady || driveLibrariesLoading || !navigator.onLine) return;
  driveLibrariesLoading = true;
  try {
    if (!window.google?.accounts?.oauth2) await loadDriveScript('https://accounts.google.com/gsi/client');
    if (!window.gapi) await loadDriveScript('https://apis.google.com/js/api.js');
    await new Promise((resolve, reject) => gapi.load('picker', {callback: resolve, onerror: reject, timeout: 15000, ontimeout: reject}));
    driveLibrariesReady = true;
  } catch (_) { driveLibrariesReady = false; }
  finally { driveLibrariesLoading = false; }
}
window.addEventListener('load', prepareDriveLibraries);
window.addEventListener('online', prepareDriveLibraries);
function backupToDrive() {
  if (!navigator.onLine) { alert('Connecte-toi à Internet pour sauvegarder sur Drive.'); return; }
  if (!driveLibrariesReady) { prepareDriveLibraries(); alert('Chargement de Google Drive en cours. Réessaie dans quelques secondes.'); return; }
  const button = document.getElementById('driveBackupButton');
  button.disabled = true;
  let finished = false;
  const finish = () => { if (!finished) { finished = true; button.disabled = false; } };
  try {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE,
      error_callback: () => { finish(); alert('Connexion Google annulée ou impossible. Aucune sauvegarde envoyée.'); },
      callback: response => {
        if (response.error || !response.access_token) { finish(); alert('Autorisation Google non accordée. Aucune sauvegarde envoyée.'); return; }
        try {
          const folders = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true);
          const picker = new google.picker.PickerBuilder().addView(folders)
            .setOAuthToken(response.access_token).setDeveloperKey(DRIVE_BROWSER_KEY).setAppId(DRIVE_APP_ID)
            .setCallback(async selection => {
              if (selection.action === google.picker.Action.CANCEL) { finish(); return; }
              if (selection.action !== google.picker.Action.PICKED) return;
              const folder = selection.docs?.[0];
              if (!folder?.id) { finish(); alert('Aucun dossier sélectionné.'); return; }
              try {
                const data = snapshotData();
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const name = `fit-frites-sauvegarde-${stamp}.json`;
                const boundary = 'fitfrites_' + Math.random().toString(36).slice(2);
                const metadata = {name, mimeType: 'application/json', parents: [folder.id]};
                const body = new Blob([
                  `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata),
                  `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(data, null, 2),
                  `\r\n--${boundary}--\r\n`
                ], {type: `multipart/related; boundary=${boundary}`});
                const result = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
                  method: 'POST', headers: {Authorization: `Bearer ${response.access_token}`, 'Content-Type': `multipart/related; boundary=${boundary}`}, body
                });
                if (!result.ok) throw new Error(`Google Drive a répondu ${result.status}.`);
                const uploaded = await result.json();
                if (!uploaded.id) throw new Error('La confirmation de sauvegarde est incomplète.');
                try { localStorage.setItem('fit_frites_last_drive_backup', new Date().toISOString()); } catch (_) {}
                alert(`Sauvegarde complète envoyée sur Google Drive : ${uploaded.name || name}`);
              } catch (error) { alert(`Sauvegarde non confirmée : ${error.message || 'erreur de connexion'}. Tes données locales restent disponibles.`); }
              finally { finish(); }
            }).build();
          picker.setVisible(true);
        } catch (_) { finish(); alert('Impossible d’ouvrir la sélection du dossier Google Drive.'); }
      }
    });
    tokenClient.requestAccessToken({prompt: 'select_account'});
  } catch (_) { finish(); alert('Impossible de démarrer la connexion Google.'); }
}
