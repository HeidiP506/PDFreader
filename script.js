const SUPABASE_URL = "https://tqxcuvpxzpgwrfqobnur.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeGN1dnB4enBnd3JmcW9ibnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUwMzEsImV4cCI6MjEwMjgwMTAzMX0.1MB-7R4MwVOXdOIgsDWkTei1L7O9XPBMSQ0_VT9Eu2s";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let currentBookId = "";
let currentFolder = "All";
const currentUserId = "demo-user";

init();

async function init() {
  await loadFolders();
  await fetchSavedBooks();
}

document.getElementById('new-folder-btn').addEventListener('click', () => {
  const name = prompt("Enter new folder name:");
  if (name) {
    const selector = document.getElementById('folder-selector');
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selector.appendChild(opt);
    selector.value = name;
    currentFolder = name;
    fetchSavedBooks();
  }
});

document.getElementById('folder-selector').addEventListener('change', (e) => {
  currentFolder = e.target.value;
  fetchSavedBooks();
});

document.getElementById('pdf-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Sanitize name for storage and book ID
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  currentBookId = cleanFileName.replace('.pdf', '');

  const folderPath = currentFolder === "All" ? "Uncategorized" : currentFolder;
  const storagePath = `${currentUserId}/${folderPath}/${cleanFileName}`;

  const { error } = await supabaseClient.storage
    .from('pdf-files')
    .upload(storagePath, file, { upsert: true });

  if (error) {
    alert("Upload failed: " + error.message);
    return;
  }

  await loadFolders();
  await fetchSavedBooks();
  document.getElementById('book-selector').value = storagePath;
  loadPDFFromStorage(storagePath);
});

document.getElementById('book-selector').addEventListener('change', (e) => {
  if (e.target.value) {
    loadPDFFromStorage(e.target.value);
  }
});

async function loadFolders() {
  const { data: rootFolders } = await supabaseClient.storage.from('pdf-files').list(currentUserId);
  const selector = document.getElementById('folder-selector');
  selector.innerHTML = '<option value="All">All Folders</option>';

  if (rootFolders) {
    rootFolders.forEach(item => {
      if (!item.name.endsWith('.pdf')) {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        selector.appendChild(opt);
      }
    });
  }
}

async function fetchSavedBooks() {
  const selector = document.getElementById('book-selector');
  selector.innerHTML = '<option value="">-- Select Saved Book --</option>';

  const targetPath = currentFolder === "All" ? "" : currentFolder;
  const { data: items } = await supabaseClient.storage.from('pdf-files').list(`${currentUserId}/${targetPath}`);

  if (items) {
    for (const item of items) {
      if (item.name.endsWith('.pdf')) {
        const fullPath = targetPath ? `${currentUserId}/${targetPath}/${item.name}` : `${currentUserId}/${item.name}`;
        const opt = document.createElement('option');
        opt.value = fullPath;
        opt.textContent = item.name;
        selector.appendChild(opt);
      }
    }
  }
}

async function loadPDFFromStorage(filePath) {
  clearOverlayLayers();
  
  const pathParts = filePath.split('/');
  const rawFileName = pathParts[pathParts.length - 1];
  
  // Consistently derive book_id across upload and dropdown load
  currentBookId = rawFileName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, "_");

  const { data: publicUrlData } = supabaseClient.storage
    .from('pdf-files')
    .getPublicUrl(filePath);

  try {
    const response = await fetch(publicUrlData.publicUrl);
    if (!response.ok) throw new Error("Could not fetch file from storage");

    const arrayBuffer = await response.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
    document.getElementById('page-count').textContent = pdfDoc.numPages;

    const { data: progress } = await supabaseClient
      .from('progress')
      .select('last_viewed_page')
      .eq('user_id', currentUserId)
      .eq('book_id', currentBookId)
      .maybeSingle();

    pageNum = progress ? progress.last_viewed_page : 1;
    renderPage(pageNum);
  } catch (err) {
    console.error("Download Error:", err);
    alert("Error loading PDF from storage: " + err.message);
  }
}

function clearOverlayLayers() {
  document.getElementById('annotation-layer').innerHTML = '';
  document.getElementById('text-layer').innerHTML = '';
  document.getElementById('annotation-list').innerHTML = 'No annotations on this page.';
}

async function renderPage(num) {
  clearOverlayLayers();

  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: 1.5 });

  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const wrapper = document.getElementById('pdf-wrapper');
  wrapper.style.width = `${viewport.width}px`;
  wrapper.style.height = `${viewport.height}px`;

  await page.render({ canvasContext: ctx, viewport: viewport }).promise;
  document.getElementById('page-num').textContent = num;

  const textLayerDiv = document.getElementById('text-layer');
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;

  const textContent = await page.getTextContent();
  pdfjsLib.renderTextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: viewport,
    textDivs: []
  });

  if (currentBookId) {
    await supabaseClient.from('progress').upsert({
      user_id: currentUserId,
      book_id: currentBookId,
      last_viewed_page: num
    }, { onConflict: 'user_id,book_id' });
  }

  loadAnnotations(num);
}

document.getElementById('pdf-wrapper').addEventListener('mouseup', async () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const wrapperRect = document.getElementById('pdf-wrapper').getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) return;

  const userComment = prompt("Add a comment/note for this text (optional):") || "";
  const annotation = {
    x: rect.left - wrapperRect.left,
    y: rect.top - wrapperRect.top,
    w: rect.width,
    h: rect.height
  };
  const type = document.getElementById('mode').value;

  console.log("Saving annotation for book_id:", currentBookId);

  const { error } = await supabaseClient.from('annotations').insert({
    book_id: currentBookId,
    user_id: currentUserId,
    page_number: pageNum,
    annotation_type: type,
    rects: annotation,
    comment_text: userComment,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error("Error inserting annotation:", error);
    alert("Save failed: " + error.message);
    return;
  }

  selection.removeAllRanges();
  loadAnnotations(pageNum);
});

async function loadAnnotations(num) {
  const layer = document.getElementById('annotation-layer');
  const list = document.getElementById('annotation-list');
  layer.innerHTML = '';
  list.innerHTML = '';

  const { data: items, error } = await supabaseClient
    .from('annotations')
    .select('*')
    .eq('book_id', currentBookId)
    .eq('page_number', num);

  if (error) {
    console.error("Error loading annotations:", error);
    return;
  }

  if (!items || items.length === 0) {
    list.innerHTML = 'No annotations on this page.';
    return;
  }

  items.forEach(item => {
    drawAnnotationBox(item.rects, item.annotation_type, item.comment_text);

    const card = document.createElement('div');
    card.className = 'annotation-card';
    card.innerHTML = `
      <p><strong>Type:</strong> ${item.annotation_type}</p>
      <p><strong>Note:</strong> ${item.comment_text || '<em>No comment</em>'}</p>
      <div class="actions">
        <button class="edit-btn" data-id="${item.id}" data-text="${item.comment_text || ''}">Edit Note</button>
        <button class="danger delete-btn" data-id="${item.id}">Delete</button>
      </div>
    `;
    list.appendChild(card);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const text = e.target.getAttribute('data-text');
      editAnnotation(id, text);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteAnnotation(id);
    });
  });
}

function drawAnnotationBox(rect, type, commentText) {
  const layer = document.getElementById('annotation-layer');
  const box = document.createElement('div');
  box.className = type;
  box.style.left = `${rect.x}px`;
  box.style.top = `${rect.y}px`;
  box.style.width = `${rect.w}px`;
  box.style.height = `${rect.h}px`;

  if (commentText) {
    box.setAttribute('data-comment', commentText);
  }

  layer.appendChild(box);
}

async function editAnnotation(id, currentText) {
  const newText = prompt("Update comment:", currentText);
  if (newText !== null) {
    await supabaseClient
      .from('annotations')
      .update({ comment_text: newText })
      .eq('id', id);
    loadAnnotations(pageNum);
  }
}

async function deleteAnnotation(id) {
  if (confirm("Delete this annotation?")) {
    await supabaseClient
      .from('annotations')
      .delete()
      .eq('id', id);
    loadAnnotations(pageNum);
  }
}

document.getElementById('prev').addEventListener('click', () => {
  if (pageNum <= 1) return;
  pageNum--;
  renderPage(pageNum);
});

document.getElementById('next').addEventListener('click', () => {
  if (pageNum >= pdfDoc.numPages) return;
  pageNum++;
  renderPage(pageNum);
});
