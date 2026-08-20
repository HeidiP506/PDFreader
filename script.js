const SUPABASE_URL = "https://tqxcuvpxzpgwrfqobnur.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeGN1dnB4enBnd3JmcW9ibnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUwMzEsImV4cCI6MjEwMjgwMTAzMX0.1MB-7R4MwVOXdOIgsDWkTei1L7O9XPBMSQ0_VT9Eu2s";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let currentBookId = "";
let currentFilePath = "";
let currentFolderPath = ""; // Track current directory path in the explorer
const currentUserId = "demo-user";

// Annotation Color States
let activeHighlightColor = "#ffeb3b80"; // Semi-transparent yellow default
let activeUnderlineColor = "#2196f3";   // Blue default

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
  setupFileExplorerUI();
  await loadFileExplorer(currentFolderPath);
}

function setupExtraUIControls() {
  const controlsDiv = document.querySelector('.reader-controls') || document.body;

  // Modernized Mode Selector with Color Pickers
  if (!document.getElementById('tool-style-controls')) {
    const styleGroup = document.createElement('div');
    styleGroup.id = 'tool-style-controls';
    styleGroup.style.display = 'inline-flex';
    styleGroup.style.alignItems = 'center';
    styleGroup.style.gap = '8px';
    styleGroup.style.margin = '0 10px';

    styleGroup.innerHTML = `
      <label for="highlight-color-picker" title="Highlighter Color" style="cursor:pointer; display:flex; align-items:center; gap:4px;">
        🖍️ <input type="color" id="highlight-color-picker" value="#ffeb3b" style="border:none; width:24px; height:24px; cursor:pointer; background:none;">
      </label>
      <label for="underline-color-picker" title="Underline Color" style="cursor:pointer; display:flex; align-items:center; gap:4px;">
        ✏️ <input type="color" id="underline-color-picker" value="#2196f3" style="border:none; width:24px; height:24px; cursor:pointer; background:none;">
      </label>
    `;
    controlsDiv.appendChild(styleGroup);

    document.getElementById('highlight-color-picker').addEventListener('input', (e) => {
      // Convert hex to rgba with alpha for transparent highlighter effect
      const hex = e.target.value;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      activeHighlightColor = `rgba(${r}, ${g}, ${b}, 0.45)`;
    });

    document.getElementById('underline-color-picker').addEventListener('input', (e) => {
      activeUnderlineColor = e.target.value;
    });
  }

  if (!document.getElementById('move-book-btn')) {
    const moveBtn = document.createElement('button');
    moveBtn.id = 'move-book-btn';
    moveBtn.innerHTML = '📁 Move PDF';
    moveBtn.addEventListener('click', moveCurrentPDF);
    controlsDiv.appendChild(moveBtn);
  }

  if (!document.getElementById('delete-book-btn')) {
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'delete-book-btn';
    deleteBtn.className = 'danger';
    deleteBtn.innerHTML = '🗑️ Delete PDF';
    deleteBtn.addEventListener('click', deleteCurrentPDF);
    controlsDiv.appendChild(deleteBtn);
  }
}

function setupFileExplorerUI() {
  let explorerContainer = document.getElementById('file-explorer');
  
  if (!explorerContainer) {
    explorerContainer = document.createElement('div');
    explorerContainer.id = 'file-explorer';
    explorerContainer.style.padding = '15px';
    explorerContainer.style.background = '#f8f9fa';
    explorerContainer.style.borderRadius = '8px';
    explorerContainer.style.border = '1px solid #e9ecef';
    explorerContainer.style.marginBottom = '20px';

    const parent = document.querySelector('.reader-controls') || document.body;
    parent.parentNode.insertBefore(explorerContainer, parent);
  }
}

async function loadFileExplorer(folderSubPath = "") {
  const explorerContainer = document.getElementById('file-explorer');
  const targetPath = folderSubPath ? `${currentUserId}/${folderSubPath}` : currentUserId;

  const { data: items, error } = await supabaseClient.storage
    .from('pdf-files')
    .list(targetPath);

  if (error) {
    console.error("Storage list error:", error);
    return;
  }

  let html = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <div style="font-weight:600; font-size:14px; color:#495057;">
        📂 Location: <span style="color:#0d6efd; cursor:pointer;" onclick="navigateToFolder('')">Home</span> 
        ${folderSubPath ? ` / <span>${folderSubPath}</span>` : ''}
      </div>
      <button id="explorer-new-folder-btn" style="padding:4px 10px; font-size:12px; cursor:pointer;">+ New Folder</button>
    </div>
    <div id="explorer-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap:12px;">
  `;

  if (folderSubPath !== "") {
    html += `
      <div class="explorer-card" onclick="navigateUpFolder()" style="border:1px solid #dee2e6; border-radius:6px; padding:10px; text-align:center; background:#fff; cursor:pointer;">
        <div style="font-size:28px;">⬆️</div>
        <div style="font-size:12px; font-weight:bold; color:#6c757d; margin-top:4px;">.. Back</div>
      </div>
    `;
  }

  if (items) {
    items.forEach(item => {
      const isPDF = item.name.endsWith('.pdf');
      const icon = isPDF ? '📄' : '📁';
      const fullItemPath = folderSubPath ? `${folderSubPath}/${item.name}` : item.name;

      html += `
        <div class="explorer-card" 
             data-path="${currentUserId}/${fullItemPath}" 
             data-subpath="${fullItemPath}"
             data-is-pdf="${isPDF}"
             style="border:1px solid #dee2e6; border-radius:6px; padding:10px; text-align:center; background:#fff; cursor:pointer; transition:transform 0.1s;"
             onmouseover="this.style.transform='scale(1.03)'" 
             onmouseout="this.style.transform='scale(1)'">
          <div style="font-size:32px;">${icon}</div>
          <div style="font-size:11px; word-break:break-word; margin-top:6px; color:#333; font-weight:500;">
            ${item.name}
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  explorerContainer.innerHTML = html;

  // Bind Explorer Card Clicks
  document.querySelectorAll('.explorer-card[data-is-pdf]').forEach(card => {
    card.addEventListener('click', () => {
      const isPDF = card.getAttribute('data-is-pdf') === 'true';
      const path = card.getAttribute('data-path');
      const subpath = card.getAttribute('data-subpath');

      if (isPDF) {
        loadPDFFromStorage(path);
      } else {
        currentFolderPath = subpath;
        loadFileExplorer(currentFolderPath);
      }
    });
  });

  document.getElementById('explorer-new-folder-btn')?.addEventListener('click', async () => {
    const name = prompt("Enter new folder name:");
    if (name) {
      currentFolderPath = currentFolderPath ? `${currentFolderPath}/${name}` : name;
      await loadFileExplorer(currentFolderPath);
    }
  });
}

window.navigateToFolder = function(path) {
  currentFolderPath = path;
  loadFileExplorer(path);
};

window.navigateUpFolder = function() {
  const parts = currentFolderPath.split('/');
  parts.pop();
  currentFolderPath = parts.join('/');
  loadFileExplorer(currentFolderPath);
};

function setupKeyboardAndSwipe() {
  document.addEventListener('keydown', (e) => {
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
  const swipeThreshold = 50;
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

document.getElementById('pdf-upload')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  currentBookId = cleanFileName.replace('.pdf', '');

  const folderPath = currentFolderPath || "Uncategorized";
  const storagePath = `${currentUserId}/${folderPath}/${cleanFileName}`;

  const { error } = await supabaseClient.storage
    .from('pdf-files')
    .upload(storagePath, file, { upsert: true });

  if (error) {
    alert("Upload failed: " + error.message);
    return;
  }

  await loadFileExplorer(currentFolderPath);
  loadPDFFromStorage(storagePath);
});

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

async function moveCurrentPDF() {
  if (!currentFilePath) return alert("Select a PDF first.");

  const destinationFolder = prompt("Enter target folder name (e.g. Work, Personal, School):");
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
  await loadFileExplorer(destinationFolder);
  loadPDFFromStorage(newPath);
}

async function deleteCurrentPDF() {
  if (!currentFilePath) return alert("Select a PDF first.");

  if (!confirm("Are you sure you want to delete this PDF and its annotations?")) return;

  const deletedPath = currentFilePath;

  const { error } = await supabaseClient.storage
    .from('pdf-files')
    .remove([deletedPath]);

  if (error) {
    alert("Delete failed: " + error.message);
    return;
  }

  await supabaseClient.from('annotations').delete().eq('book_id', currentBookId);
  await supabaseClient.from('progress').delete().eq('book_id', currentBookId);

  pdfDoc = null;
  currentFilePath = "";
  currentBookId = "";
  clearOverlayLayers();

  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById('page-num').textContent = '0';
  document.getElementById('page-count').textContent = '0';

  await loadFileExplorer(currentFolderPath);

  alert("Book deleted permanently.");
}

function clearOverlayLayers() {
  document.getElementById('annotation-layer').innerHTML = '';
  document.getElementById('text-layer').innerHTML = '';
  document.getElementById('annotation-list').innerHTML = '<div style="color:#888; font-style:italic;">No annotations on this page.</div>';
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
    const type = document.getElementById('mode') ? document.getElementById('mode').value : "highlight";
    
    // Store custom chosen color into the record
    const color = type === 'underline' ? activeUnderlineColor : activeHighlightColor;

    const { error } = await supabaseClient.from('annotations').insert({
      book_id: currentBookId,
      user_id: currentUserId,
      page_number: pageNum,
      annotation_type: type,
      rects: { ...rect, color: color },
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
    list.innerHTML = '<div style="color:#888; font-style:italic;">No annotations on this page.</div>';
    return;
  }

  items.forEach(item => {
    drawAnnotationBox(item.rects, item.annotation_type, item.comment_text);

    // Modernized Comment Card Layout
    const card = document.createElement('div');
    card.className = 'annotation-card';
    card.style.cssText = `
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
      transition: box-shadow 0.2s ease;
    `;

    const badgeColor = item.annotation_type === 'underline' ? '#2196f3' : '#eab308';
    const badgeIcon = item.annotation_type === 'underline' ? '✏️ Underline' : '🖍️ Highlight';

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-style:space-between; margin-bottom: 8px;">
        <span style="background:${badgeColor}20; color:${badgeColor}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; border: 1px solid ${badgeColor}40;">
          ${badgeIcon}
        </span>
        <span style="font-size: 11px; color: #94a3b8; margin-left: auto;">Page ${item.page_number}</span>
      </div>
      <div style="font-size: 13px; color: #334155; margin-bottom: 10px; line-height: 1.4;">
        ${item.comment_text ? item.comment_text : '<em style="color:#a1a1aa;">No note added</em>'}
      </div>
      <div class="actions" style="display:flex; gap: 8px; justify-content: flex-end;">
        <button class="edit-btn" data-id="${item.id}" data-text="${item.comment_text || ''}" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:4px 8px; font-size:11px; border-radius:4px; cursor:pointer;">✏️ Edit</button>
        <button class="danger delete-btn" data-id="${item.id}" style="background:#fee2e2; border:1px solid #fca5a5; color:#dc2626; padding:4px 8px; font-size:11px; border-radius:4px; cursor:pointer;">🗑️ Delete</button>
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
  box.style.position = 'absolute';
  box.style.left = `${rect.x}px`;
  box.style.top = `${rect.y}px`;
  box.style.width = `${rect.w}px`;
  box.style.height = `${rect.h}px`;

  if (type === 'underline') {
    box.style.borderBottom = `3px solid ${rect.color || activeUnderlineColor}`;
  } else {
    box.style.backgroundColor = rect.color || activeHighlightColor;
  }

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

document.getElementById('prev')?.addEventListener('click', goToPrevPage);
document.getElementById('next')?.addEventListener('click', goToNextPage);
