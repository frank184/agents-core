# Document Processing Pipeline Design

> Design document for PDF/DOCX parsing, chunking, and preparation for Claude

## Overview

The document pipeline transforms raw files into structured, semantically meaningful chunks suitable for Claude's context window. This is critical because:\n- Files can be large (100+ pages)
- Claude has context limits (100K tokens typical)
- Naive splitting loses semantic meaning
- Metadata preservation enables source attribution

## Pipeline Stages

```
Slack File Upload
    ↓
[1] Download & Validate
    └─→ File type check, size check, virus scan (optional)
    ↓
[2] Extract Text
    └─→ PDF: PyPDF2 (page metadata preserved)
    └─→ DOCX: python-docx (section/heading structure preserved)
    ↓
[3] Sanitize & Normalize
    └─→ Remove formatting artifacts
    └─→ Normalize whitespace
    └─→ Detect language
    ↓
[4] Semantic Chunking
    └─→ Sentence + paragraph aware splitting
    └─→ Maintain context overlap
    └─→ Preserve headings/hierarchy
    ↓
[5] Enrich Metadata
    └─→ Source filename, page number
    └─→ Section hierarchy
    └─→ Language/encoding
    ↓
[6] Store & Index
    └─→ JSON for Claude context
    └─→ Optional: Vector DB for semantic search
```

## Stage Details

### 1. Download & Validate

```python
@dataclass
class DownloadResult:
    path: str
    size_bytes: int
    mime_type: str
    validated: bool
    error?: str

def validate_download(buffer: bytes, filename: str) -> DownloadResult:
    # File size limits
    MAX_PDF = 50 * 1024 * 1024  # 50MB
    MAX_DOCX = 25 * 1024 * 1024  # 25MB
    
    # MIME type validation
    ALLOWED_TYPES = {'.pdf', '.docx', '.doc'}
    
    # Magic bytes check (optional but recommended)
    if filename.endswith('.pdf'):
        assert buffer[:4] == b'\\x25PDF'  # PDF magic number
    
    return DownloadResult(path=path, validated=True, ...)
```

**Slack Integration:**
```typescript
// In events.ts
const fileInfo = await slackClient.getFileInfo(event.file_id);
const file = fileInfo.file as any;

if (!['.pdf', '.docx'].some(ext => file.name.toLowerCase().endsWith(ext))) {
  throw new Error('Unsupported file type');
}

if (file.size > 50 * 1024 * 1024) {
  throw new Error('File too large (>50MB)');
}
```

### 2. Extract Text

#### PDF Extraction
```python
def extract_pdf(file_path: str) -> ExtractedDocument:
    with open(file_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        pages = []
        
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            
            # Preserve page breaks and metadata
            pages.append({
                'page': page_num + 1,
                'content': text,
                'metadata': {
                    'rotation': page.get('/Rotate', 0),
                    'width': page.mediabox.width,
                    'height': page.mediabox.height,
                }
            })
        
        return ExtractedDocument(
            pages=pages,
            total_pages=len(reader.pages),
            title=reader.metadata.get('/Title'),
            author=reader.metadata.get('/Author'),
        )
```

**Challenges:**
- PDF extraction quality varies by producer (scanned PDFs need OCR)
- Forms and tables extracted poorly
- Multi-column layouts confuse text order

**Solution:** Store original page number with each chunk for verification

#### DOCX Extraction
```python
def extract_docx(file_path: str) -> ExtractedDocument:
    doc = Document(file_path)
    
    sections = []
    current_section = []
    
    for para in doc.paragraphs:
        if para.style.name.startswith('Heading'):
            if current_section:
                sections.append({
                    'heading': para.text,
                    'level': int(para.style.name[-1]) if para.style.name[-1].isdigit() else 1,
                    'content': current_section,
                })
            current_section = []
        else:
            current_section.append(para.text)
    
    # Preserve heading hierarchy for semantic understanding
    return ExtractedDocument(
        sections=sections,
        metadata={
            'author': doc.core_properties.author,
            'title': doc.core_properties.title,
            'created': doc.core_properties.created,
        }
    )
```

**Advantages:**
- Heading structure preserved
- Formatting minimal (already stripped)
- Metadata readily available

### 3. Sanitize & Normalize

```python
def normalize_text(text: str) -> str:
    """Clean extracted text for Claude ingestion"""
    # Remove control characters
    text = ''.join(ch for ch in text if ord(ch) >= 32 or ch in '\\n\\r\\t')
    
    # Collapse excessive whitespace (but preserve paragraph breaks)
    lines = text.split('\\n')
    lines = [line.rstrip() for line in lines]  # Remove trailing spaces
    
    # Remove sequences of blank lines (keep max 2)
    normalized = []
    blank_count = 0
    for line in lines:
        if not line.strip():
            blank_count += 1
            if blank_count <= 2:
                normalized.append(line)
        else:
            normalized.append(line)
            blank_count = 0
    
    return '\\n'.join(normalized)
```

**Why:** Claude performs better with clean input; also reduces token count

### 4. Semantic Chunking

**Strategy:** Sentence-level splitting with paragraph context preservation

```python
import nltk
from typing import List

nltk.download('punkt')

class SemanticChunker:
    def __init__(
        self,
        chunk_size: int = 2000,  # characters, not tokens
        overlap: int = 300,
        min_chunk_size: int = 100,
    ):
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.min_chunk_size = min_chunk_size
    
    def chunk_text(
        self,
        text: str,
        source_filename: str,
        page_num: int = None,
        section_title: str = None,
    ) -> List[DocumentChunk]:
        """
        Split text intelligently, respecting semantic boundaries.
        """
        # First pass: sentence splitting
        sentences = nltk.sent_tokenize(text)
        
        chunks = []
        current_chunk = []
        current_size = 0
        
        for sentence in sentences:
            sentence_size = len(sentence)
            
            # If adding this sentence would exceed limit
            if current_size + sentence_size > self.chunk_size and current_chunk:
                # Save current chunk
                chunk_text = ' '.join(current_chunk)
                chunks.append(DocumentChunk(
                    content=chunk_text,
                    source=source_filename,
                    page=page_num,
                    section=section_title,
                    size_chars=len(chunk_text),
                ))
                
                # Overlap: keep last N sentences
                overlap_sentences = []
                overlap_size = 0
                for sent in reversed(current_chunk):
                    if overlap_size + len(sent) > self.overlap:
                        break
                    overlap_sentences.insert(0, sent)
                    overlap_size += len(sent)
                
                current_chunk = overlap_sentences
                current_size = overlap_size
            
            current_chunk.append(sentence)
            current_size += sentence_size
        
        # Final chunk
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            if len(chunk_text) >= self.min_chunk_size:
                chunks.append(DocumentChunk(
                    content=chunk_text,
                    source=source_filename,
                    page=page_num,
                    section=section_title,
                    size_chars=len(chunk_text),
                ))
        
        return chunks
```

**Why Semantic Chunking?**
- Preserves sentence integrity (no mid-sentence splits)
- Overlap provides context for Claude
- Section awareness prevents category mixing
- Metadata enables source attribution in generated docs

### 5. Enrich Metadata

```typescript
@dataclass
class DocumentChunk:
    content: str
    source_filename: str
    page_number: int
    section_title: str
    section_level: int  # H1, H2, etc.
    chunk_index: int
    extracted_at: datetime
    language: str  # 'en', 'es', etc.
    estimated_tokens: int  # rough estimate for planning
```

**Estimation Logic:**
```python
def estimate_tokens(text: str) -> int:
    """Rough token count (Claude uses ~3.5 chars per token)"""
    return len(text) // 3 + len(text.split())
```

### 6. Storage & Index

**For Claude Context:**
```json
{
  "original_filename": "project-design.pdf",
  "extraction_timestamp": "2026-03-06T14:32:00Z",
  "total_pages": 42,
  "chunks": [
    {
      "index": 0,
      "page": 1,
      "section": "Introduction",
      "section_level": 1,
      "content": "...",
      "estimated_tokens": 450
    }
  ],
  "total_estimated_tokens": 18500
}
```

**Optional: Vector Database (for semantic search)**
```typescript
// If scaling to multiple uploads
interface VectorIndex {
  chunkId: string;
  embedding: number[];  // OpenAI embeddings
  metadata: DocumentChunk;
}

// Enable semantic similarity queries:
// "Find chunks about authentication" → vector search
```

## Error Handling

```python
class ParsingError(Exception):
    def __init__(self, stage: str, filename: str, reason: str):
        self.stage = stage
        self.filename = filename
        self.reason = reason

# Graceful degradation in Slack
try:
    parsed = parse_document(file_path)
except ParsingError as e:
    if e.stage == 'extract':
        await slack.reply(f'Failed to extract {e.filename}: {e.reason}')
    elif e.stage == 'chunk':
        await slack.reply(f'Chunking failed (proceeding with raw text)')
        # Fall back to naive chunking
```

## Performance Considerations

**Typical File:**
- 20-page PDF: ~30s extraction + 5s chunking
- 100-page DOCX: ~10s extraction + 8s chunking

**Optimization:**
- Process in background job queue
- Cache parsed results (same file uploaded twice)
- Lazy-load if needed (stream chunks to Claude instead of full context)

## Future Enhancements

1. **OCR for Scanned PDFs** - pytesseract integration
2. **Table Extraction** - pdfplumber for structured data
3. **Code Block Detection** - syntax highlighting preservation
4. **Language Detection** - multilingual prompt adaptation
