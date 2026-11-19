// Shared, read-only public drawing index and accessible artwork viewer.
// No owner credentials, payments, or inventory changes are performed here.
const MAX_PAGES = 200;

export async function allRolloCreations(base, fetcher = fetch) {
  const all = [];
  const seen = new Set();
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetcher(`${base}/creations?offset=${offset}`, { cache: 'no-store' });
    if (!response.ok) throw Error(`Drawing archive unavailable (HTTP ${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.creations)) throw Error('Invalid drawing archive response');
    let added = 0;
    for (const creation of data.creations) {
      if (!Number.isSafeInteger(creation?.id) || creation.id < 1 || seen.has(creation.id)) continue;
      seen.add(creation.id);
      all.push(creation);
      added++;
    }
    // Older Workers return only the latest 30 and ignore ?offset=.
    // In that case, display what they expose without looping forever.
    if (!added || !Number.isSafeInteger(data.nextOffset) || data.nextOffset <= offset) break;
    offset = data.nextOffset;
  }
  return all;
}

let viewer;
export function openArtwork({src, title, subtitle=''}) {
  if (!viewer) viewer = createViewer();
  const {dialog, image, heading, detail, original} = viewer;
  image.src = src;
  image.alt = title;
  heading.textContent = title;
  detail.textContent = subtitle;
  original.href = src;
  // Reopening works even if the viewer is already visible.
  if (!dialog.open) dialog.showModal();
}

function createViewer() {
  const dialog = document.createElement('dialog');
  dialog.className = 'rollo-art-viewer';
  dialog.setAttribute('aria-label', 'Enlarged artwork');
  const frame = document.createElement('div');
  frame.className = 'rollo-art-viewer-frame';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'rollo-art-viewer-close';
  close.textContent = 'Close ×';
  close.addEventListener('click', () => dialog.close());
  const heading = document.createElement('h2');
  const detail = document.createElement('p');
  const image = document.createElement('img');
  const original = document.createElement('a');
  original.textContent = 'Open original drawing';
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  frame.append(close, heading, detail, image, original);
  dialog.append(frame);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  // Avoid leaving a large artwork downloaded in memory when viewer closes.
  dialog.addEventListener('close', () => { image.removeAttribute('src'); });
  document.body.append(dialog);
  return {dialog, image, heading, detail, original};
}

export function imagePreview({src, title, subtitle = '', loading = 'lazy'}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rollo-art-preview';
  button.setAttribute('aria-label', `Enlarge ${title}`);
  const img = document.createElement('img');
  img.loading = loading;
  img.alt = title;
  img.src = src;
  button.append(img);
  button.addEventListener('click', () => openArtwork({src, title, subtitle}));
  return button;
}
