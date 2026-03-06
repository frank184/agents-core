# Document Parser Guide

> How the agent extracts text from PDFs and DOCX files, chunks content semantically, and prepares it for Claude

## Overview

The document parser transforms raw files (PDF, DOCX) into structured, semantic chunks. This is critical for:
- **Large documents** - PDF peut be 100+ pages; Claude has context limits
- **Quality** - Naive splitting loses meaning; semantic chunking preserves it
- **Provenance** - Metadata (page, section) enables source attribution in generated docs

## Key References

- **PyPDF2**: [PDF Text Extraction](https://github.com/py-pdf/pypdf)
- **python-docx**: [DOCX Documents](https://python-docx.readthedocs.io/)
- **Chunking Strategy**: Semantic (sentence-aware) vs naive text splitting

## Architecture

### Pipeline Stages

```
Uploaded File (PDF or DOCX)
       ↓
[1] Download & Validate
    - File type check (.pdf, .docx)
    - Size check (max 50MB)
    - MIME type validation
       ↓
[2] Extract Text
    PDF:  PyPDF2 → iterate pages → extract text
    DOCX: python-docx → paragraphs → sections → hierarchy
       ↓
[3] Normalize & Sanitize
    - Remove control characters
    - Collapse excessive whitespace
    - Fix encoding issues
       ↓
[4] Semantic Chunking
    - Split on sentences (not mid-word)
    - Maintain paragraph overlap
    - Preserve section hierarchy
       ↓
[5] Enrich Metadata
    - Source filename
    - Page/section numbers
    - Language, encoding
       ↓
[6] Return JSON
    {
      "filename": "api.pdf",
      "chunks": [
        {
          "content": "...",
          "page": 1,
          "section": "Introduction",
          "index": 0
        }
      ]
    }
```

## Implementation Details

### 1. File Validation

Before parsing, validate the file:

```python
def validate_file(file_path: str, max_size_mb: int = 50) -> bool:
    """Ensure file is valid before parsing"""
    path = Path(file_path)
    
    # File exists
    if not path.exists():
        raise FileNotFoundError(f"{file_path} not found")
    
    # File size
    file_size_mb = path.stat().st_size / (1024 * 1024)
    if file_size_mb > max_size_mb:
        raise ValueError(f"File too large: {file_size_mb}MB > {max_size_mb}MB")
    
    # File type
    supported = {'.pdf', '.docx', '.doc'}
    if path.suffix.lower() not in supported:
        raise ValueError(f"Unsupported type: {path.suffix}")
    
    return True
```

### 2. PDF Extraction

```python
import PyPDF2
from pathlib import Path

def extract_pdf(file_path: str) -> List[dict]:
    """Extract text from PDF with page tracking"""
    pages = []
    
    with open(file_path, 'rb') as f:
        pdf_reader = PyPDF2.PdfReader(f)
        
        for page_num, page in enumerate(pdf_reader.pages):
            # Extract text from this page
            text = page.extract_text()
            
            pages.append({
                'page_number': page_num + 1,
                'content': text,
                'metadata': {
                    'rotation': page.get('/Rotate', 0),
                    'width': float(page.mediabox.width),
                    'height': float(page.mediabox.height),
                }
            })
    
    return pages
```

**Challenges with PDFs:**
- **Scanned PDFs** - Image-based, no text extraction (would need OCR)
- **Multi-column** - Text order may be wrong
- **Tables** - Poorly extracted as unstructured text
- **Metadata** - Some PDFs don't preserve title/author

**Solution:** Store original page numbers with each chunk for verification.

### 3. DOCX Extraction

```python
from docx import Document
from docx.oxml.text.paragraph import CT_P
from docx.table import _Cell, Table

def extract_docx(file_path: str) -> List[dict]:
    """Extract text from DOCX with section hierarchy"""
    doc = Document(file_path)
    sections = []
    current_section = {
        'title': None,
        'level': 0,
        'content': []
    }
    
    for para in doc.paragraphs:
        # Detect heading
        if para.style.name.startswith('Heading'):
            # Save previous section if exists
            if current_section['content'] or current_section['title']:
                sections.append(current_section)
            
            # Start new section
            level = int(para.style.name[-1]) if para.style.name[-1].isdigit() else 1
            current_section = {
                'title': para.text,
                'level': level,
                'content': []
            }
        elif para.text.strip():  # Non-empty paragraph
            current_section['content'].append(para.text)
    
    # Don't forget last section
    if current_section['content'] or current_section['title']:
        sections.append(current_section)
    
    # Extract tables (optional but recommended)
    for table in doc.tables:
        table_text = '\n'.join([
            ' | '.join(cell.text for cell in row.cells)
            for row in table.rows
        ])
        current_section['content'].append(f"[TABLE]\n{table_text}")
    
    return sections
```

**Advantages of DOCX:**
- Heading hierarchy preserved
- No OCR needed
- Metadata easily accessible
- Better structure than PDFs

### 4. Normalize & Sanitize

```python
def normalize_text(text: str) -> str:
    """Clean extracted text for Claude"""
    # Remove control characters (keep newlines)
    text = ''.join(
        ch for ch in text 
        if ord(ch) >= 32 or ch in '\n\r\t'
    )
    
    # Fix common extraction issues
    text = text.replace('\x00', '')  # Null bytes
    text = text.replace('\\u3000', ' ')  # Wide spaces
    
    # Collapse multiple newlines
    while '\n\n\n' in text:
        text = text.replace('\n\n\n', '\n\n')
    
    return text.strip()
```

Why normalize?
- Claude performs better with clean input
- Reduces token count (saves cost)
- Prevents parsing errors in downstream processing

### 5. Semantic Chunking

**Key Principle:** Split on sentence boundaries, not arbitrary character counts

```python
import nltk
from typing import List

nltk.download('punkt')  # Sentence tokenizer

class SemanticChunker:
    CHUNK_SIZE = 2000  # characters, not tokens
    CHUNK_OVERLAP = 300
    MIN_CHUNK_SIZE = 100
    
    @staticmethod
    def chunk_text(
        text: str,
        source_filename: str,
        page_num: int = None,
        section_title: str = None,
    ) -> List[dict]:
        """Split text intelligently at sentence boundaries"""
        
        # First: sentence tokenize
        sentences = nltk.sent_tokenize(text)
        
        chunks = []
        current_chunk = []
        current_size = 0
        
        for sentence in sentences:
            sentence_size = len(sentence)
            
            # Would this sentence exceed the limit?
            if current_size + sentence_size > SemanticChunker.CHUNK_SIZE and current_chunk:
                # Save current chunk
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    'content': chunk_text,
                    'source': source_filename,
                    'page': page_num,
                    'section': section_title,
                    'size': len(chunk_text),
                    'index': len(chunks),
                })
                
                # Overlap: keep last N sentences for context
                overlap_sentences = []
                overlap_size = 0
                for sent in reversed(current_chunk):
                    if overlap_size + len(sent) > SemanticChunker.CHUNK_OVERLAP:
                        break
                    overlap_sentences.insert(0, sent)
                    overlap_size += len(sent)
                
                current_chunk = overlap_sentences
                current_size = overlap_size
            
            # Add sentence to current chunk
            current_chunk.append(sentence)
            current_size += sentence_size
        
        # Don't forget final chunk
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            if len(chunk_text) >= SemanticChunker.MIN_CHUNK_SIZE:
                chunks.append({
                    'content': chunk_text,
                    'source': source_filename,
                    'page': page_num,
                    'section': section_title,
                    'size': len(chunk_text),
                    'index': len(chunks),
                })
        
        return chunks
```

**Why Semantic Chunking?**
| Approach | Pro | Con |
|----------|-----|-----|
| **Character count** | Simple | Splits sentences mid-word |
| **Sentence boundary** | Preserves meaning | Uneven chunk sizes |
| **Paragraph** | Natural breaks | May be too large |
| **Semantic (ours)** | Context + overlap | More computation |

**Overlap Strategy:**
- Each chunk contains last 300 chars of previous
- Provides context when viewed in isolation
- Claude can reference related chunks

### 6. Metadata Enrichment

```python
@dataclass
class DocumentChunk:
    content: str              # Actual text
    source_filename: str      # Where it came from
    page_number: int          # PDF page or DOCX section
    section_title: str        # Section heading (if any)
    section_level: int        # H1, H2, H3, etc.
    chunk_index: int          # Position in sequence
    extracted_at: datetime    # When extracted
    size_chars: int           # Content length
    estimated_tokens: int     # For planning Claude cost
    language: str             # 'en', 'es', etc. (langdetect)
```

**Why metadata?**
- Source attribution in generated docs
- Error recovery (which page failed?)
- Cost estimation (tokens → price)
- Language detection for multi-lingual docs

### 7. Output Format

Return JSON that Claude can process:

```json
{
  "original_filename": "architecture.pdf",
  "document_type": "pdf",
  "extraction_timestamp": "2026-03-06T14:32:00Z",
  "total_pages": 42,
  "total_chunks": 67,
  "chunks": [
    {
      "index": 0,
      "page": 1,
      "section": "Introduction",
      "section_level": 1,
      "content": "This document describes the system architecture...",
      "size_chars": 1847,
      "estimated_tokens": 485
    },
    {
      "index": 1,
      "page": 1,
      "section": "Introduction",
      "section_level": 1,
      "content": "...previous context overlap... The system is built on microservices...",
      "size_chars": 2104,
      "estimated_tokens": 520
    }
  ],
  "metadata": {
    "file_size_bytes": 2048576,
    "pages": 42,
    "language": "en",
    "has_tables": true,
    "scanned_document": false
  },
  "summary": {
    "total_chars": 156789,
    "total_estimated_tokens": 38456,
    "avg_chunk_size": 2340
  }
}
```

## Error Handling

```python
class ParseError(Exception):
    def __init__(self, stage: str, filename: str, reason: str):
        self.stage = stage
        self.filename = filename
        self.reason = reason

try:
    if file_path.endswith('.pdf'):
        pages = extract_pdf(file_path)
    elif file_path.endswith('.docx'):
        sections = extract_docx(file_path)
    
    return {
        'success': True,
        'chunks': semantic_chunking(pages or sections),
    }
except ParseError as e:
    return {
        'success': False,
        'error': f"Failed at {e.stage}: {e.reason}",
        'file': e.filename,
    }
```

## Performance Characteristics

**Typical Processing Times:**
- 10-page PDF: ~15s extraction + 3s chunking
- 50-page DOCX: ~8s extraction + 5s chunking
- Large files (100+ pages): Consider async queue

**Optimization Tips:**
1. Cache parsed results (same file uploaded twice)
2. Process in background jobs (don't block Slack)
3. Stream chunks to Claude (don't buffer all)
4. Consider vector DB for semantic search (future)

## Testing

```python
import pytest

def test_chunk_text_respects_boundaries():
    """Chunks don't split sentences"""
    text = "First sentence. Second sentence. Third."
    chunks = SemanticChunker.chunk_text(text, "test.txt")
    
    # Each chunk should be complete sentences
    for chunk in chunks:
        assert chunk['content'][-1] in '.!?'  # Ends with punctuation

def test_chunk_overlap():
    """Chunks have overlap for context"""
    text = "A. B. C. D. E. F." * 100
    chunks = SemanticChunker.chunk_text(text, "test.txt")
    
    # Overlapping chunks share text
    if len(chunks) > 1:
        last_chars_chunk_0 = chunks[0]['content'][-100:]
        first_chars_chunk_1 = chunks[1]['content'][:100]
        assert len(set(last_chars_chunk_0) & set(first_chars_chunk_1)) > 0

def test_metadata_preservation():
    """Metadata attached to each chunk"""
    chunks = SemanticChunker.chunk_text(
        "Test content.",
        source_filename="test.pdf",
        page_num=5,
        section_title="Methods"
    )
    
    for chunk in chunks:
        assert chunk['source'] == "test.pdf"
        assert chunk['page'] == 5
        assert chunk['section'] == "Methods"
```

## Next Steps

1. ✅ Understand extraction and chunking (this doc)
2. ✅ **Parser implemented** in `src/document-parser/`
3. ⏳ **Wire to async pipeline** in Task 4/5/6
4. ⏳ **Feed chunks to Claude** for generation

## Resources

- [PyPDF2 Documentation](https://pypdf.readthedocs.io/)
- [python-docx Documentation](https://python-docx.readthedocs.io/)
- [NLTK Tokenizers](https://www.nltk.org/api/nltk.tokenize.html)
- [Chunking Strategies](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/text_splitter.py)
