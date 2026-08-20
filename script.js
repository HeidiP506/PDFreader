// Supabase Credentials
const SUPABASE_URL = "https://tqxcuvpxzpgwrfqobnur.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeGN1dnB4enBnd3JmcW9ibnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUwMzEsImV4cCI6MjEwMjgwMTAzMX0.1MB-7R4MwVOXdOIgsDWkTei1L7O9XPBMSQ0_VT9Eu2s";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let currentBookId = "";
const currentUserId = "demo-user";

fetchSavedBooks();

// 1. Upload PDF to lowercase 'pdf-files' bucket
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  currentBookId = file.name.replace(/[^a-zA-Z0-9]/g, "_");

  const { error } = await supabaseClient.storage
    .from('pdf-files')
    .upload(`${currentUserId}/${currentBookId}.pdf`, file, { upsert: true });

  if (error) {
    console.error("Storage upload error:", error);
    alert("Upload failed: " + error.message);
    return;
  }

  await fetchSavedBooks();
  document.getElementById('book-selector').value = currentBookId;
  loadPDFFromStorage(currentBookId);
});

// 2. Select Saved Book from Dropdown
document.getElementById('book-selector').addEventListener('change', (e) => {
  if (e.target.value) {
    currentBookId = e.target.value;
    loadPDFFromStorage(currentBookId);
  }
});

// Fetch list of saved PDFs
async function fetchSavedBooks() {
  const { data: files } = await supabaseClient.storage.from('pdf-files').list(currentUserId);
  const selector = document.getElementById('book-selector');
  selector.innerHTML = '<option value="">-- Select Saved Book --</option>';

  if (files) {
    files.forEach(file => {
      if (file.name.endsWith('.pdf')) {
        const bookId = file.name.replace('.pdf', '');
        const opt = document.createElement('option');
        opt.value = bookId;
        opt.textContent = file.name;
        selector.appendChild(opt);
      }
    });
  }
}

// Download PDF bytes via Public URL
async function loadPDFFromStorage(bookId) {
  const { data: publicUrlData } = supabaseClient.storage
    .from('pdf-files')
    .getPublicUrl(`${currentUserId}/${bookId}.pdf`);

  try {
    const response = await fetch(publicUrlData.publicUrl);
    if (!response.ok) throw new Error("Could not fetch file");

    const arrayBuffer = await response.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
    document.getElementById('page-count').textContent = pdfDoc.numPages;

    const { data: progress } = await supabaseClient
      .from('progress')
      .select('last_viewed_page')
      .eq('user_id', currentUserId)
      .eq('book_id', bookId)
      .single();

    pageNum = progress ? progress.last_viewed_page : 1;
    renderPage(pageNum);
  } catch (err) {
    console.error("Download Error:", err);
    alert("Error loading PDF from storage.");
  }
}

async function renderPage(num) {
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
  textLayerDiv.innerHTML = '';
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

// Handle annotations
document.getElementById('pdf-wrapper').addEventListener('mouseup', async () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const wrapperRect = document.getElementById('pdf-wrapper').getBoundingClientRect();

  const userComment = prompt("Add a comment/note for this text (optional):") || "";

  const annotation = {
    x: rect.left - wrapperRect.left,
    y: rect.top - wrapperRect.top,
    w: rect.width,
    h: rect.height
  };

  const type = document.getElementById('mode').value;

  drawAnnotationBox(annotation, type, userComment);

  await supabaseClient.from('annotations').insert({
    book_id: currentBookId,
    user_id: currentUserId,
    page_number: pageNum,
    annotation_type: type,
    rects: annotation,
    comment_text: userComment
  });

  selection.removeAllRanges();
});

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

async function loadAnnotations(num) {
  const layer = document.getElementById('annotation-layer');
  layer.innerHTML = '';

  const { data: items } = await supabaseClient
    .from('annotations')
    .select('*')
    .eq('book_id', currentBookId)
    .eq('page_number', num);

  if (items) {
    items.forEach(item => drawAnnotationBox(item.rects, item.annotation_type, item.comment_text));
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
