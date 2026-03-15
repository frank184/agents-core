import pytest
import json
from pathlib import Path
import sys
import os

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from document_parser.parser import DocumentParser
from document_parser.types import DocumentType, ParsedDocument, DocumentChunk
from document_parser.main import serialize_parsed_doc

@pytest.fixture
def sample_pdf_path(tmp_path):
    """Create a minimal test PDF"""
    # For testing, we'll create a simple text file that simulates PDF output
    test_file = tmp_path / "test.pdf"
    test_file.write_text("Sample PDF content for testing")
    return str(test_file)

def test_chunk_text_basic():
    """Test that text chunking works correctly"""
    text = "This is a test. " * 500  # Create text longer than chunk size
    chunks = DocumentParser._chunk_text(text, "test.pdf")
    
    assert len(chunks) > 1
    assert all(chunk.content.strip() for chunk in chunks)
    assert all(chunk.source == "test.pdf" for chunk in chunks)

def test_chunk_text_respects_size():
    """Test that chunks don't exceed max size"""
    text = "A" * 5000
    chunks = DocumentParser._chunk_text(text, "test.pdf")
    
    for chunk in chunks:
        assert len(chunk.content) <= DocumentParser.CHUNK_SIZE + 100  # small buffer

def test_serialize_parsed_doc():
    """Test that ParsedDocument serializes to JSON"""
    doc = ParsedDocument(
        original_filename="test.pdf",
        document_type=DocumentType.PDF,
        total_pages=5,
        chunks=[DocumentChunk(content="test", source="test.pdf", page=1, chunk_index=0)],
        metadata={'test': True}
    )
    
    result = serialize_parsed_doc(doc)
    json_str = json.dumps(result)  # Should not raise
    assert result['original_filename'] == "test.pdf"
