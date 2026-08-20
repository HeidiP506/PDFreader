const SUPABASE_URL = "https://tqxcuvpxzpgwrfqobnur.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeGN1dnB4enBnd3JmcW9ibnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUwMzEsImV4cCI6MjEwMjgwMTAzMX0.1MB-7R4MwVOXdOIgsDWkTei1L7O9XPBMSQ0_VT9Eu2s";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let currentBookId = "";
let currentFilePath = "";
let currentFolder = "All";
const currentUserId = "demo-user";

// Drag-to-Draw State
let isDragging = false;
let startX = 0;
let startY = 0;

// Swipe Gesture State
let touchStartX = 0;
let touchEndX = 0;

init();

async function init() {
  setupExtraUIControls();
  setupKeyboardAndSwipe();
  await loadFolders();
  await fetchSavedBooks();
}

function setupExtraUIControls() {
  const controlsDiv = document.querySelector('.reader-controls') || document.body;

  // Add Move & Delete buttons if missing
  if (!document.getElementById('move-book-btn')) {
    const moveBtn = document.createElement('button');
    moveBtn.id = 'move-book-btn';
    moveBtn.textContent = 'Move PDF';
    moveBtn.addEventListener('click', moveCurrentPDF);
    controlsDiv.appendChild(moveBtn);
  }

  if (!document.getElementById('delete-book-btn')) {
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'delete-book-btn';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Delete PDF';
    deleteBtn.addEventListener('click', deleteCurrentPDF);
    controlsDiv.appendChild(deleteBtn);
  }
}

// Keyboard (Arrow Keys) & Touch (Swipe) Event Listeners
function setupKeyboardAndSwipe() {
  document.addEventListener('keydown', (e) => {
    // Prevent accidental page flip when typing in a prompt or input field
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowLeft') {
      goToPrevPage();
    } else if (e.key === 'ArrowRight') {
      goToNextPage();
    }
  });

  const wrapper = document.getElementById('pdf-wrapper');

  wrapper.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });
}

function handleSwipe() {
  const swipeThreshold = 50; // Minimum distance to trigger swipe action
  if (touchEndX < touchStartX - swipeThreshold) {
    goToNextPage();
  }
  if (touchEndX > touchStartX + swipeThreshold) {
    goToPrevPage();
  }
}

function goToPrevPage() {
  if (!pdfDoc || pageNum <= 1) return;
  pageNum--;
  renderPage(pageNum);
}

function goToNextPage() {
  if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
  pageNum++;
  renderPage(pageNum);
}

// Folder & Upload Handlers
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
  currentFilePath = filePath;
  
  const pathParts = filePath.split('/');
  const rawFileName = pathParts[pathParts.length - 1];
  
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

// Move and Delete PDF Operations
async function moveCurrentPDF() {
  if (!currentFilePath) return alert("Select a PDF first.");

  const destinationFolder = prompt("Enter target folder name (e.g. Work, Personal, Uncategorized):");
  if (!destinationFolder) return;

  const fileName = currentFilePath.split('/').pop();
  const newPath = `${currentUserId}/${destinationFolder}/${fileName}`;

  const { error } = await supabaseClient.storage
    .from('pdf-files')
    .move(currentFilePath, newPath);

  if (error) {
    alert("Move failed: " + error.message);
    return;
  }

  alert("Book moved successfully.");
  await loadFolders();
  await fetchSavedBooks();
  document.getElementById('book-selector').value = newPath;
  loadPDFFromStorage(newPath);
}

async function deleteCurrentPDF() {
  if (!currentFilePath) return alert("Select a PDF first.");

  if (!confirm("Are you sure you want to delete this PDF and its annotations?")) return;

  const { error } = await supabaseClient.storage
    .from('pdf-files')
    .remove([currentFilePath]);

  if (error) {
    alert("Delete failed: " + error.message);
    return;
  }

  // Clear annotations and progress records
  await supabaseClient.from('annotations').delete().eq('book_id', currentBookId);
  await supabaseClient.from('progress').delete().eq('book_id', currentBookId);

  alert("PDF deleted.");
  pdfDoc = null;
  currentFilePath = "";
  currentBookId = "";
  clearOverlayLayers();
  
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  await fetchSavedBooks();
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

  textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
  wrapper.style.setProperty('--scale-factor', viewport.scale);

  const textContent = await page.getTextContent();

  try {
    pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    });
  } catch (e) {
    console.log("Text layer render fallback");
  }

  if (currentBookId) {
    await supabaseClient.from('progress').upsert({
      user_id: currentUserId,
      book_id: currentBookId,
      last_viewed_page: num
    }, { onConflict: 'user_id,book_id' });
  }

  loadAnnotations(num);
}

// Annotation Drag & Selection Handler
const wrapper = document.getElementById('pdf-wrapper');

wrapper.addEventListener('mousedown', (e) => {
  if (e.target.id === 'pdf-canvas' || e.target.classList.contains('textLayer') || e.target.id === 'annotation-layer') {
    isDragging = true;
    const wrapperRect = wrapper.getBoundingClientRect();
    startX = e.clientX - wrapperRect.left;
    startY = e.clientY - wrapperRect.top;
  }
});

wrapper.addEventListener('mouseup', async (e) => {
  const selection = window.getSelection();
  const wrapperRect = wrapper.getBoundingClientRect();
  let rect = null;

  if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
    const range = selection.getRangeAt(0);
    const clientRect = range.getBoundingClientRect();
    rect = {
      x: clientRect.left - wrapperRect.left,
      y: clientRect.top - wrapperRect.top,
      w: clientRect.width,
      h: clientRect.height
    };
    selection.removeAllRanges();
  } else if (isDragging) {
    const endX = e.clientX - wrapperRect.left;
    const endY = e.clientY - wrapperRect.top;

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    if (width > 8 || height > 8) {
      rect = {
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        w: width,
        h: height > 8 ? height : 15
      };
    }
  }

  isDragging = false;

  if (rect && rect.w > 0) {
    const userComment = prompt("Add a comment/note for this annotation (optional):") || "";
    const type = document.getElementById('mode').value;

    const { error } = await supabaseClient.from('annotations').insert({
      book_id: currentBookId,
      user_id: currentUserId,
      page_number: pageNum,
      annotation_type: type,
      rects: rect,
      comment_text: userComment,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("Error inserting annotation:", error);
      alert("Save failed: " + error.message);
      return;
    }

    loadAnnotations(pageNum);
  }
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

document.getElementById('prev').addEventListener('click', goToPrevPage);
document.getElementById('next').addEventListener('click', goToNextPage);
