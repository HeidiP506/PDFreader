const SUPABASE_URL = "https://tqxcuvpxzpgwrfqobnur.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeGN1dnB4enBnd3JmcW9ibnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUwMzEsImV4cCI6MjEwMjgwMTAzMX0.1MB-7R4MwVOXdOIgsDWkTei1L7O9XPBMSQ0_VT9Eu2s";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let currentBookId = "";
let currentFilePath = "";
let currentFolderPath = ""; 
const currentUserId = "demo-user";

// Annotation Color & Mode States
let activeMode = "highlight";
let activeHighlightColor = "#ffeb3b80"; // Semi-transparent yellow
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
  removeRedundantToolbarDOM();
  setupStickySideToolbar();
  setupKeyboardAndSwipe();
  setupFileExplorerUI();
  await loadFileExplorer(currentFolderPath);
}

// Fallback cleanup if the element exists in HTML
function removeRedundantToolbarDOM() {
  const oldControls = document.querySelector('.reader-controls');
  if (oldControls) {
    oldControls.remove();
  }
}

function setupStickySideToolbar() {
  let sidebar = document.getElementById('annotation-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'annotation-sidebar';
    document.body.appendChild(sidebar);
  }

  sidebar.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: 280px;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    z-index: 1000;
  `;

  sidebar.innerHTML = `
    <!-- Floating Toolbar Controls -->
    <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Annotation Tools</div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
        <button id="tool-btn-highlight" style="padding: 8px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #e2e8f0; background: #fef08a; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
          🖍️ Highlight
        </button>
        <button id="tool-btn-underline" style="padding: 8px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #e2e8f0; background: #f1f5f9; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
          ✏️ Underline
        </button>
      </div>

      <div style="display: flex; align-items: center; justify-space: between; background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #f1f5f9; margin-bottom: 12px;">
        <span style="font-size: 12px; font-weight: 500; color: #475569;">Active Color:</span>
        <input type="color" id="sticky-color-picker" value="#ffeb3b" style="border: none; width: 28px; height: 28px; cursor: pointer; background: none; border-radius: 50%;">
      </div>

      <!-- Page Navigation Integrated Directly Into Sidebar -->
      <div style="display: flex; align-items: center; justify-content: space-between; background: #f1f5f9; padding: 6px 10px; border-radius: 6px;">
        <button id="sticky-prev-btn" style="padding: 4px 10px; font-size: 11px; font-weight: 600; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; cursor: pointer;">Previous</button>
        <span style="font-size: 11px; font-weight: 600; color: #475569;">Page <span id="sticky-page-num">0</span> / <span id="sticky-page-count">0</span></span>
        <button id="sticky-next-btn" style="padding: 4px 10px; font-size: 11px; font-weight: 600; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; cursor: pointer;">Next</button>
      </div>
    </div>

    <!-- Quick Reader Actions -->
    <div style="display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
      <button id="sticky-move-btn" style="flex:1; padding: 6px; font-size: 11px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer;">📁 Move</button>
      <button id="sticky-delete-btn" style="flex:1; padding: 6px; font-size: 11px; border: 1px solid #fca5a5; background: #fee2e2; color: #dc2626; border-radius: 6px; cursor: pointer;">🗑️ Delete</button>
    </div>

    <!-- Live Annotation Notes List -->
    <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Page Notes</div>
    <div id="annotation-list">
      <div style="color: #94a3b8; font-size: 12px; font-style: italic;">No annotations on this page.</div>
    </div>
  `;

  // Bind Buttons
  const highlightBtn = document.getElementById('tool-btn-highlight');
  const underlineBtn = document.getElementById('tool-btn-underline');
  const colorPicker = document.getElementById('sticky-color-picker');

  highlightBtn.addEventListener('click', () => {
    activeMode = "highlight";
    highlightBtn.style.background = "#fef08a";
    underlineBtn.style.background = "#f1f5f9";
    colorPicker.value = "#ffeb3b";
  });

  underlineBtn.addEventListener('click', () => {
    activeMode = "underline";
    underlineBtn.style.background = "#bae6fd";
    highlightBtn.style.background = "#f1f5f9";
    colorPicker.value = "#2196f3";
  });

  colorPicker.addEventListener('input', (e) => {
    const hex = e.target.value;
    if (activeMode === "highlight") {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      activeHighlightColor = `rgba(${r}, ${g}, ${b}, 0.45)`;
    } else {
      activeUnderlineColor = hex;
    }
  });

  document.getElementById('sticky-prev-btn').addEventListener('click', goToPrevPage);
  document.getElementById('sticky-next-btn').addEventListener('click', goToNextPage);
  document.getElementById('sticky-move-btn').addEventListener('click', moveCurrentPDF);
  document.getElementById('sticky-delete-btn').addEventListener('click', deleteCurrentPDF);
}

function setupFileExplorerUI() {
  let explorerContainer = document.getElementById('file-explorer');
  if (!explorerContainer) {
    explorerContainer = document.createElement('div');
    explorerContainer.id = 'file-explorer';
    explorerContainer.style.padding = '16px';
    explorerContainer.style.background = '#f8fafc';
    explorerContainer.style.borderRadius = '10px';
    explorerContainer.style.border = '1px solid #e2e8f0';
    explorerContainer.style.marginBottom = '20px';

    document.body.insertBefore(explorerContainer, document.body.firstChild);
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
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
      <div style="font-weight:600; font-size:14px; color:#334155;">
        📁 Directory: <span style="color:#2563eb; cursor:pointer;" onclick="navigateToFolder('')">Home</span> 
        ${folderSubPath ? ` / <span>${folderSubPath}</span>` : ''}
      </div>
      
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="explorer-new-folder-btn" style="padding:6px 12px; font-size:12px; font-weight:600; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer;">+ New Folder</button>
        
        <label for="explorer-upload-input" style="padding:6px 12px; font-size:12px; font-weight:600; background:#059669; color:#fff; border-radius:6px; cursor:pointer; display:inline-block;">
          📤 Upload PDF
        </label>
        <input type="file" id="explorer-upload-input" accept="application/pdf" style="display:none;" />
      </div>
    </div>

    <div id="explorer-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap:12px;">
  `;

  if (folderSubPath !== "") {
    html += `
      <div class="explorer-card" onclick="navigateUpFolder()" style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; text-align:center; background:#fff; cursor:pointer;">
        <div style="font-size:28px;">⬆️</div>
        <div style="font-size:11px; font-weight:bold; color:#64748b; margin-top:4px;">.. Back</div>
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
             style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; background:#fff; cursor:pointer; transition:transform 0.1s, box-shadow 0.1s;"
             onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)';" 
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
          <div style="font-size:32px;">${icon}</div>
          <div style="font-size:11px; word-break:break-word; margin-top:6px; color:#1e293b; font-weight:500;">
            ${item.name}
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  explorerContainer.innerHTML = html;

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

  document.getElementById('explorer-upload-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    currentBookId = cleanFileName.replace(/\.pdf$/i, '');

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
  if (wrapper) {
    wrapper.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
  }
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

    updatePageCounters(1, pdfDoc.numPages);

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

function updatePageCounters(current, total) {
  const numEl = document.getElementById('sticky-page-num');
  const countEl = document.getElementById('sticky-page-count');
  if (numEl) numEl.textContent = current;
  if (countEl) countEl.textContent = total;
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
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  updatePageCounters(0, 0);
  await loadFileExplorer(currentFolderPath);

  alert("Book deleted permanently.");
}

function clearOverlayLayers() {
  const annLayer = document.getElementById('annotation-layer');
  const txtLayer = document.getElementById('text-layer');
  const annList = document.getElementById('annotation-list');

  if (annLayer) annLayer.innerHTML = '';
  if (txtLayer) txtLayer.innerHTML = '';
  if (annList) annList.innerHTML = '<div style="color:#94a3b8; font-size:12px; font-style:italic;">No annotations on this page.</div>';
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
  updatePageCounters(num, pdfDoc.numPages);

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
if (wrapper) {
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
      const color = activeMode === 'underline' ? activeUnderlineColor : activeHighlightColor;

      const { error } = await supabaseClient.from('annotations').insert({
        book_id: currentBookId,
        user_id: currentUserId,
        page_number: pageNum,
        annotation_type: activeMode,
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
}

async function loadAnnotations(num) {
  const layer = document.getElementById('annotation-layer');
  const list = document.getElementById('annotation-list');
  if (layer) layer.innerHTML = '';
  if (list) list.innerHTML = '';

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
    if (list) list.innerHTML = '<div style="color:#94a3b8; font-size:12px; font-style:italic;">No annotations on this page.</div>';
    return;
  }

  items.forEach(item => {
    drawAnnotationBox(item.rects, item.annotation_type, item.comment_text);

    if (list) {
      const card = document.createElement('div');
      card.className = 'annotation-card';
      card.style.cssText = `
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px;
        margin-bottom: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      `;

      const badgeColor = item.annotation_type === 'underline' ? '#0284c7' : '#ca8a04';
      const badgeIcon = item.annotation_type === 'underline' ? '✏️ Underline' : '🖍️ Highlight';

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-space:between; margin-bottom: 6px;">
          <span style="background:${badgeColor}15; color:${badgeColor}; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 10px; border: 1px solid ${badgeColor}30;">
            ${badgeIcon}
          </span>
          <span style="font-size: 10px; color: #94a3b8;">Page ${item.page_number}</span>
        </div>
        <div style="font-size: 12px; color: #334155; margin-bottom: 8px; line-height: 1.3;">
          ${item.comment_text ? item.comment_text : '<em style="color:#a1a1aa;">No comment</em>'}
        </div>
        <div class="actions" style="display:flex; gap: 6px; justify-content: flex-end;">
          <button class="edit-btn" data-id="${item.id}" data-text="${item.comment_text || ''}" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:2px 6px; font-size:10px; border-radius:4px; cursor:pointer;">✏️ Edit</button>
          <button class="danger delete-btn" data-id="${item.id}" style="background:#fee2e2; border:1px solid #fca5a5; color:#dc2626; padding:2px 6px; font-size:10px; border-radius:4px; cursor:pointer;">🗑️ Delete</button>
        </div>
      `;
      list.appendChild(card);
    }
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
  if (!layer) return;

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
